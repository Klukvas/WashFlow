#!/usr/bin/env python3
"""Read-only, portable SSH probe; no deployment imports, uploads or database access."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import signal
import subprocess
import sys
from typing import Any, Optional

FAILED_RELEASE = 'b672d6b9dc2f0c07ed3eea6efb753c0afb5f9eb6-40234261128-1'
FILES = ('payload.json', 'expected.json', 'preflight.json', 'images.json', 'rollback.json',
         'backup/database.dump', 'backup/uploads.tar', 'backup/manifest.json', 'result.json')
HEALTH = ('healthy', 'unhealthy', 'starting', 'none', 'unknown')
REFUSALS = ('python_3_11_required', 'bootstrap_root_unsafe', 'bootstrap_releases_unsafe')
META = '{"running":{{json .State.Running}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}"none"{{end}},"image":{{json .Image}}}'
FAILURES = {'validation': 'invalid_access_metadata', 'ssh': 'ssh_command_failed',
            'protocol': 'interpreter_or_protocol_failed'}


class ProbeFailure(ValueError):
    def __init__(self, stage: str) -> None:
        self.stage = stage if stage in FAILURES else 'protocol'
        super().__init__(FAILURES[self.stage])


def capture(args: list, data: Optional[bytes] = None, timeout: int = 10) -> bytes:
    """Never expose stderr, even when SSH or Docker emits credential-bearing output."""
    proc = subprocess.Popen(args, stdin=subprocess.PIPE if data is not None else subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    try:
        stdout, _ = proc.communicate(data, timeout=timeout)
    except BaseException:
        os.killpg(proc.pid, signal.SIGTERM)
        try:
            proc.communicate(timeout=3)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.communicate()
        raise ValueError('probe_command_failed') from None
    if proc.returncode or len(stdout) > 65536:
        raise ValueError('probe_command_failed')
    return stdout


def version(raw: bytes) -> Optional[str]:
    text = raw.decode('ascii', errors='replace').strip()
    return text if re.fullmatch(r'[0-9]{1,4}(\.[0-9]{1,4}){1,3}', text) else None


def safe_path(path: Path) -> bool:
    return not any(p.is_symlink() for p in [path] + list(path.parents))


def private_directory(path: Path) -> bool:
    return (safe_path(path) and path.is_dir() and path.stat().st_uid == os.getuid()
            and path.stat().st_mode & 0o077 == 0)


def small_json(path: Path) -> Any:
    if not safe_path(path) or not path.is_file() or path.stat().st_size > 262144:
        raise ValueError('invalid_metadata')
    return json.loads(path.read_bytes())


def file_hash(path: Path) -> str:
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(65536), b''):
            value.update(block)
    return value.hexdigest()


def release_state(root: Path) -> dict:
    releases = root / 'releases'
    release = releases / FAILED_RELEASE
    result = {'root_safe': safe_path(root) and root.is_dir(),
              'releases_private': private_directory(releases),
              'release_private': private_directory(release),
              'files': {name: False for name in FILES},
              'payload_hashes_match': None, 'configuration_hashes_match': None}
    if not result['release_private']:
        return result
    result['files'] = {name: safe_path(release / name) and (release / name).is_file() for name in FILES}
    try:
        manifest = small_json(release / 'payload.json')
        names = {'common.py', 'remote.py', 'catalog.sql', 'expected.json'}
        if isinstance(manifest, dict) and set(manifest) == names:
            result['payload_hashes_match'] = all(
                isinstance(manifest[name], str) and re.fullmatch(r'[0-9a-f]{64}', manifest[name])
                and safe_path(release / name) and (release / name).is_file()
                and (release / name).stat().st_size <= 262144
                and file_hash(release / name) == manifest[name] for name in names)
    except (OSError, ValueError, TypeError):
        pass  # Absence/invalid metadata stays unknown, never a successful integrity claim.
    try:
        expected = small_json(release / 'preflight.json')['configuration_hashes']
        paths = [root / '.env', root / 'docker-compose.yml']
        if isinstance(expected, dict) and set(expected) == {str(p) for p in paths}:
            result['configuration_hashes_match'] = all(
                isinstance(expected[str(p)], str) and re.fullmatch(r'[0-9a-f]{64}', expected[str(p)])
                and safe_path(p) and p.is_file() and p.stat().st_size <= 1048576
                and file_hash(p) == expected[str(p)] for p in paths)
    except (OSError, ValueError, TypeError, KeyError):
        pass
    return result


def probe(root: Path = Path('/opt/washflow')) -> dict:
    state = release_state(root)
    refusals = ([REFUSALS[0]] if sys.version_info < (3, 11) else [])
    if not state['root_safe']:
        refusals.append(REFUSALS[1])
    elif (root / 'releases').exists() and not state['releases_private']:
        refusals.append(REFUSALS[2])
    report = {'format': 'washflow-readonly-diagnostic-v1', 'python': list(sys.version_info[:3]),
              'docker': None, 'compose': None, 'apps': {'backend': [], 'frontend': []},
              'release': state, 'observed_prerequisite_refusals': refusals, 'docker_probe_ok': False}
    try:
        report['docker'] = version(capture(['docker', 'version', '--format', '{{.Server.Version}}']))
        report['compose'] = version(capture(['docker', 'compose', 'version', '--short']))
        for service in ['backend', 'frontend']:
            ids = capture(['docker', 'ps', '-aq', '--no-trunc', '--filter',
                           'label=com.docker.compose.project.working_dir=/opt/washflow', '--filter',
                           'label=com.docker.compose.service=' + service]).decode('ascii').split()
            if len(ids) > 4 or not all(re.fullmatch(r'[0-9a-f]{64}', x) for x in ids):
                raise ValueError('invalid_metadata')
            report['apps'][service] = [json.loads(capture(['docker', 'inspect', '--format', META, x])) for x in ids]
        report['docker_probe_ok'] = True
    except (OSError, ValueError, TypeError, UnicodeError):
        report['docker_probe_ok'] = False
    return filter_report(report)


def filter_report(value: dict) -> dict:
    """Re-project untrusted SSH JSON; unknown keys/strings never reach CI stdout."""
    if not isinstance(value, dict) or value.get('format') != 'washflow-readonly-diagnostic-v1':
        raise ValueError('invalid_diagnostic_protocol')
    py = value.get('python')
    if not isinstance(py, list) or len(py) != 3 or not all(type(n) is int and 0 <= n <= 10000 for n in py):
        raise ValueError('invalid_diagnostic_protocol')
    result = {'format': value['format'], 'python': py,
              'docker': version(str(value.get('docker')).encode()),
              'compose': version(str(value.get('compose')).encode()),
              'docker_probe_ok': value.get('docker_probe_ok') is True,
              'apps': {}, 'release': {}, 'observed_prerequisite_refusals': []}
    apps_by_service = value.get('apps')
    state = value.get('release')
    if not isinstance(apps_by_service, dict) or not isinstance(state, dict) or not isinstance(state.get('files'), dict):
        raise ValueError('invalid_diagnostic_protocol')
    for name in ['backend', 'frontend']:
        apps = apps_by_service.get(name, [])
        if not isinstance(apps, list) or len(apps) > 4:
            raise ValueError('invalid_diagnostic_protocol')
        result['apps'][name] = []
        for app in apps:
            if not isinstance(app, dict):
                raise ValueError('invalid_diagnostic_protocol')
            image = app.get('image')
            result['apps'][name].append({'running': app.get('running') is True,
                'health': app.get('health') if app.get('health') in HEALTH else 'unknown',
                'image': image if isinstance(image, str) and re.fullmatch(r'sha256:[0-9a-f]{64}', image) else None})
    for name in ['root_safe', 'releases_private', 'release_private']:
        result['release'][name] = state.get(name) is True
    for name in ['payload_hashes_match', 'configuration_hashes_match']:
        result['release'][name] = state.get(name) if type(state.get(name)) is bool else None
    result['release']['files'] = {name: state.get('files', {}).get(name) is True for name in FILES}
    refusals = value.get('observed_prerequisite_refusals', [])
    result['observed_prerequisite_refusals'] = [name for name in REFUSALS if isinstance(refusals, list) and name in refusals]
    return result


def connect(args: argparse.Namespace) -> dict:
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.-]*', args.host) or not re.fullmatch(r'[a-z_][a-z0-9_-]*', args.user):
        raise ProbeFailure('validation')
    command = ['ssh', '-i', str(args.key), '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
               '-o', 'StrictHostKeyChecking=yes', '-o', 'UpdateHostKeys=no', '-o', 'ControlMaster=no',
               '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=10', '-o', 'ServerAliveCountMax=3',
               args.user + '@' + args.host, shlex.join(['python3', '-B', '-', '--probe'])]
    try:
        raw = capture(command, data=Path(__file__).read_bytes(), timeout=150)
    except (OSError, ValueError):
        raise ProbeFailure('ssh') from None
    try:
        return filter_report(json.loads(raw))
    except (ValueError, TypeError, KeyError, AttributeError):
        raise ProbeFailure('protocol') from None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--probe', action='store_true')
    for name in ['host', 'user', 'key']:
        parser.add_argument('--' + name)
    args = parser.parse_args()
    try:
        result = probe() if args.probe else connect(args)
        print(json.dumps(result, sort_keys=True))
        return 0
    except (OSError, ValueError, TypeError, KeyError, AttributeError) as error:
        stage = error.stage if isinstance(error, ProbeFailure) else 'protocol'
        print(json.dumps({'diagnostic': 'failed', 'stage': stage, 'reason': FAILURES[stage]}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
