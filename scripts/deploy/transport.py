#!/usr/bin/env python3
"""Send only vetted deployment helpers/expected metadata over verified SSH."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shlex
import signal
import subprocess
import sys
import tarfile
import threading
import time

from common import Refusal, require

# Only these reviewed protocol codes may cross the SSH boundary. Never forward stderr,
# exception text, unknown JSON fields, host metadata or an arbitrary remote reason.
REASONS = frozenset('''invalid_host invalid_user invalid_revision invalid_attempt invalid_sha_image
payload_too_large payload_bootstrap_failed remote_deploy_failed transport_interrupted
command_failed_output_withheld command_interrupted_or_timed_out invalid_protocol
python_3_11_required bootstrap_root_unsafe bootstrap_releases_unsafe bootstrap_release_exists
bootstrap_payload_invalid bootstrap_failed unfinished_migration pending_extra_or_duplicate_migration
migration_checksum_drift schema_drift live_configuration_changed other_upload_writer
other_backend_writer project_writer_topology_changed database_has_other_clients
release_outside_owned_root invalid_expected_format invalid_expected_database
single_existing_backend_required invalid_project unexpected_project_topology unknown_backend_command
existing_stack_not_healthy project_directory_mismatch app_compose_files_differ unexpected_base_compose
unknown_existing_compose_override non_image_existing_override unknown_existing_runtime_policy
existing_override_image_mismatch uploads_volume_required unexpected_backend_mount linux_docker_required
unsupported_architecture postgres16_utf8_required pg_restore16_required insufficient_disk_for_backup
insufficient_host_capacity new_image_platform_mismatch new_image_revision_missing invalid_image_id
insufficient_disk_after_pull backup_integrity_failed deployment_interrupted unsafe_existing_lock
preflight_or_recovery_failed symlink_path missing_regular_path directory_not_private_or_owned
unsafe_upload_path unsafe_upload_type duplicate_upload_path missing_upload_bytes truncated_upload
health_deadline_exceeded'''.split())


class StageFailure(Refusal):
    def __init__(self, stage: str, reason: str) -> None:
        self.stage = stage
        super().__init__(reason if reason in REASONS else 'invalid_protocol')


def safe_result(raw: bytes) -> dict:
    require(len(raw) <= 65536, 'invalid_protocol')
    result = json.loads(raw)
    require(isinstance(result, dict), 'invalid_protocol')
    return result


def bootstrap_run(command: list, data: bytes) -> bytes:
    proc = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, start_new_session=True)
    try:
        stdout, _ = proc.communicate(data, timeout=90)
    except BaseException:
        os.killpg(proc.pid, signal.SIGTERM)
        try:
            proc.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.communicate()
        raise Refusal('command_interrupted_or_timed_out') from None
    if proc.returncode:
        try:
            result = safe_result(stdout)
            reason = result.get('reason')
        except (ValueError, Refusal):
            reason = None
        raise Refusal(reason if isinstance(reason, str) and reason in REASONS
                      else 'command_failed_output_withheld')
    return stdout

# No shell expansion of host metadata or archive member paths. The bootstrap only creates
# a fresh private release below the existing deployment root and refuses every symlink.
BOOTSTRAP = r'''
import hashlib,io,json,os,pathlib,sys,tarfile
def guard(condition,code='bootstrap_payload_invalid'):
 if not condition:
  print(json.dumps({'reason':code}))
  raise SystemExit(1)
os.umask(0o077)
guard(sys.version_info >= (3,11),'python_3_11_required')
root=pathlib.Path('/opt/washflow')
guard(root.is_dir() and not any(p.is_symlink() for p in [root,*root.parents]),'bootstrap_root_unsafe')
releases=root/'releases'
if not releases.exists(): releases.mkdir(mode=0o700)
guard(releases.is_dir() and not releases.is_symlink(),'bootstrap_releases_unsafe')
guard(releases.stat().st_uid==os.getuid() and releases.stat().st_mode&0o077==0,'bootstrap_releases_unsafe')
dest=releases/sys.argv[1]
guard(not dest.exists() and not dest.is_symlink(),'bootstrap_release_exists')
raw=sys.stdin.buffer.read(1048577)
guard(len(raw)<=1048576)
expected={'common.py','remote.py','catalog.sql','expected.json','payload.json'}
with tarfile.open(fileobj=io.BytesIO(raw),mode='r:') as archive:
 members=archive.getmembers()
 guard(len(members)==len(expected) and {m.name for m in members}==expected)
 guard(all(m.isfile() and m.size<=262144 for m in members))
 contents={m.name:archive.extractfile(m).read() for m in members}
 manifest=json.loads(contents['payload.json'])
 guard(set(manifest)==expected-{'payload.json'})
 guard(all(hashlib.sha256(contents[n]).hexdigest()==h for n,h in manifest.items()))
 dest.mkdir(mode=0o700)
 for name,data in contents.items():
  with (dest/name).open('xb') as stream: stream.write(data)
print('payload_verified')
'''


def archive_payload(directory, expected):
    contents = {name: (directory / name).read_bytes() for name in ['common.py', 'remote.py', 'catalog.sql']}
    contents['expected.json'] = expected.read_bytes()
    contents['payload.json'] = json.dumps({n: hashlib.sha256(b).hexdigest()
                                           for n, b in contents.items()}).encode()
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode='w:') as archive:
        for name, data in contents.items():
            member = tarfile.TarInfo(name)
            member.size, member.mode = len(data), 0o600
            archive.addfile(member, io.BytesIO(data))
    return buffer.getvalue()


def connect(args):
    require(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.-]*', args.host), 'invalid_host')
    require(re.fullmatch(r'[a-z_][a-z0-9_-]*', args.user), 'invalid_user')
    require(re.fullmatch(r'[0-9a-f]{40}', args.revision), 'invalid_revision')
    require(re.fullmatch(r'[0-9]+-[0-9]+', args.attempt), 'invalid_attempt')
    for image in [args.backend, args.frontend]:
        require(re.fullmatch(r'[a-z0-9][a-z0-9._/-]*:' + args.revision, image), 'invalid_sha_image')
    name = args.revision + '-' + args.attempt
    ssh = ['ssh', '-i', str(args.key), '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
           '-o', 'StrictHostKeyChecking=yes', '-o', 'UpdateHostKeys=no', '-o', 'ControlMaster=no',
           '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=10', '-o', 'ServerAliveCountMax=3',
           args.user + '@' + args.host]
    payload = archive_payload(Path(__file__).parent, args.expected)
    require(len(payload) <= 1024**2, 'payload_too_large')
    command = shlex.join(['python3', '-B', '-c', BOOTSTRAP, name])
    try:
        require(bootstrap_run(ssh + [command], payload).strip() == b'payload_verified',
                'payload_bootstrap_failed')
    except (Refusal, OSError, ValueError) as error:
        raise StageFailure('bootstrap', str(error)) from None
    release = '/opt/washflow/releases/' + name
    command = shlex.join(['python3', '-B', release + '/remote.py', '--release', release,
                          '--backend', args.backend, '--frontend', args.frontend,
                          '--revision', args.revision, '--watch-stdin'])
    proc = subprocess.Popen(ssh + [command], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, start_new_session=True)
    def heartbeat():
        try:
            while proc.poll() is None:
                proc.stdin.write(b'.')
                proc.stdin.flush()
                time.sleep(2)
        except (BrokenPipeError, OSError):
            pass  # Remote exit is checked by the owning thread.
    threading.Thread(target=heartbeat, daemon=True).start()
    try:
        proc.wait(timeout=7200)
        result = safe_result(proc.stdout.read(65537))
        if proc.returncode != 0:
            reason = result.get('reason')
            raise StageFailure('remote', reason if isinstance(reason, str) else 'invalid_protocol')
        require(proc.returncode == 0 and result.get('deployment') == 'deployed'
                and result.get('revision') == args.revision, 'remote_deploy_failed')
        print(json.dumps({'deployment': 'deployed', 'revision': args.revision}))
    except (Refusal, OSError, ValueError, subprocess.TimeoutExpired) as error:
        if isinstance(error, StageFailure):
            raise
        raise StageFailure('remote', str(error)) from None
    finally:
        if proc.poll() is None:
            os.killpg(proc.pid, signal.SIGTERM)
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['host', 'user', 'backend', 'frontend', 'revision', 'attempt']:
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--key', type=Path, required=True)
    parser.add_argument('--expected', type=Path, required=True)
    args = parser.parse_args()
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(Refusal('transport_interrupted')))
    try:
        connect(args)
        return 0
    except (Refusal, OSError, ValueError, subprocess.TimeoutExpired) as error:
        reason = str(error) if isinstance(error, Refusal) and str(error) in REASONS else 'invalid_protocol'
        stage = error.stage if isinstance(error, StageFailure) else 'validation'
        print(json.dumps({'deployment': 'failed', 'stage': stage, 'reason': reason}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
