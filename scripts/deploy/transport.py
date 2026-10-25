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

from common import Refusal, require, run

# No shell expansion of host metadata or archive member paths. The bootstrap only creates
# a fresh private release below the existing deployment root and refuses every symlink.
BOOTSTRAP = r'''
import hashlib,io,json,os,pathlib,sys,tarfile
def guard(condition):
 if not condition: raise SystemExit(1)
os.umask(0o077)
guard(sys.version_info >= (3,11))
root=pathlib.Path('/opt/washflow')
guard(root.is_dir() and not any(p.is_symlink() for p in [root,*root.parents]))
releases=root/'releases'
if not releases.exists(): releases.mkdir(mode=0o700)
guard(releases.is_dir() and not releases.is_symlink())
guard(releases.stat().st_uid==os.getuid() and releases.stat().st_mode&0o077==0)
dest=releases/sys.argv[1]
guard(not dest.exists() and not dest.is_symlink())
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
    require(run(ssh + [command], data=payload, timeout=90).strip() == b'payload_verified',
            'payload_bootstrap_failed')
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
        result = json.loads(proc.stdout.read(65537))
        require(proc.returncode == 0 and result.get('deployment') == 'deployed'
                and result.get('revision') == args.revision, 'remote_deploy_failed')
        print(json.dumps({'deployment': 'deployed', 'revision': args.revision}))
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
    except (Refusal, OSError, ValueError, subprocess.TimeoutExpired):
        print(json.dumps({'deployment': 'failed', 'details': 'withheld'}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
