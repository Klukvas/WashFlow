#!/usr/bin/env python3
"""Portable SSH probe with bounded read-only PostgreSQL metadata queries; no mutations, deployment imports or uploads."""
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
import time
from typing import Any, Optional

FAILED_RELEASE = '67493a6a4aedbfb5f193de08403989ebf9c462ef-40240991478-1'
FILES = ('payload.json', 'expected.json', 'preflight.json', 'images.json', 'rollback.json',
         'backup/database.dump', 'backup/uploads.tar', 'backup/manifest.json', 'result.json')
HEALTH = ('healthy', 'unhealthy', 'starting', 'none', 'unknown')
REFUSALS = ('python_3_11_required', 'bootstrap_root_unsafe', 'bootstrap_releases_unsafe')
META = '{"running":{{json .State.Running}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}"none"{{end}},"image":{{json .Image}}}'
GET_URLS = ('http://localhost:80/', 'http://127.0.0.1:80/')
HEALTH_CLASSES = ('ok', 'connection_refused', 'localhost_resolution_failed', 'timeout', 'unknown_failure')
GET_RESULTS = ('ok', 'nonzero', 'unavailable')
MAX_BYTES = 2 ** 60
CAPACITY_BYTES = ('sysconf_free_bytes', 'memory_total_bytes', 'memory_free_bytes',
                  'memory_available_bytes', 'disk_total_bytes', 'disk_free_bytes', 'disk_available_bytes')
MEMINFO_KEYS = {'MemTotal': 'memory_total_bytes', 'MemFree': 'memory_free_bytes',
                'MemAvailable': 'memory_available_bytes'}
# Compare inside Docker's formatter: neither the configured command nor health output is
# returned to Python/CI. Only exact known BusyBox messages receive a named classification.
KNOWN_TEST = json.dumps(['CMD', 'wget', '-qO-', GET_URLS[0]], separators=(',', ':'))
HEALTH_DETAIL = ('{"known_localhost_wget":{{if .Config.Healthcheck}}{{eq (json .Config.Healthcheck.Test) '
                + json.dumps(KNOWN_TEST) + '}}{{else}}false{{end}},"known_ipv4_wget":'
                '{{if .Config.Healthcheck}}{{eq (json .Config.Healthcheck.Test) '
                + json.dumps(json.dumps(['CMD', 'wget', '-qO-', GET_URLS[1]], separators=(',', ':')))
                + '}}{{else}}false{{end}},"recent":['
                '{{if .State.Health}}{{range $i,$entry := .State.Health.Log}}{{if lt $i 5}}{{if $i}},{{end}}'
                '{"exit_code":{{json $entry.ExitCode}},"failure_class":'
                '{{if eq $entry.ExitCode 0}}"ok"'
                '{{else if eq $entry.Output "wget: can\'t connect to remote host: Connection refused\\n"}}"connection_refused"'
                '{{else if eq $entry.Output "wget: bad address \'localhost\'\\n"}}"localhost_resolution_failed"'
                '{{else if eq $entry.Output "wget: download timed out\\n"}}"timeout"'
                '{{else}}"unknown_failure"{{end}}}{{end}}{{end}}{{end}}]}')
FAILURES = {'validation': 'invalid_access_metadata', 'ssh': 'ssh_command_failed',
            'protocol': 'interpreter_or_protocol_failed'}
DB_GROUPS = {'by_state': ('active', 'idle', 'idle_in_transaction', 'aborted_transaction', 'disabled', 'other'),
             'by_backend_type': ('client_backend', 'autovacuum_worker', 'logical_replication_worker', 'parallel_worker', 'other'),
             'by_client_addr': ('null', 'present'), 'by_application': ('pg_isready', 'psql', 'other')}
PG_COMMAND = ('exec psql -XqAt --no-password -v ON_ERROR_STOP=1 '
              '-U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}"')
CLIENT_COUNTS_SQL = b'''BEGIN READ ONLY; SET LOCAL statement_timeout='3s';
SELECT json_build_object('total',count(*),
 'by_state',json_build_object(
  'active',count(*) FILTER (WHERE state='active'),
  'idle',count(*) FILTER (WHERE state='idle'),
  'idle_in_transaction',count(*) FILTER (WHERE state='idle in transaction'),
  'aborted_transaction',count(*) FILTER (WHERE state='idle in transaction (aborted)'),
  'disabled',count(*) FILTER (WHERE state='disabled'),
  'other',count(*) FILTER (WHERE state IS NULL OR state NOT IN ('active','idle','idle in transaction','idle in transaction (aborted)','disabled'))),
 'by_backend_type',json_build_object(
  'client_backend',count(*) FILTER (WHERE backend_type='client backend'),
  'autovacuum_worker',count(*) FILTER (WHERE backend_type='autovacuum worker'),
  'logical_replication_worker',count(*) FILTER (WHERE backend_type='logical replication worker'),
  'parallel_worker',count(*) FILTER (WHERE backend_type='parallel worker'),
  'other',count(*) FILTER (WHERE backend_type IS NULL OR backend_type NOT IN ('client backend','autovacuum worker','logical replication worker','parallel worker'))),
 'by_client_addr',json_build_object('null',count(*) FILTER (WHERE client_addr IS NULL),
                                  'present',count(*) FILTER (WHERE client_addr IS NOT NULL)),
 'by_application',json_build_object('pg_isready',count(*) FILTER (WHERE application_name='pg_isready'),
                                  'psql',count(*) FILTER (WHERE application_name='psql'),
                                  'other',count(*) FILTER (WHERE application_name IS NULL OR application_name NOT IN ('pg_isready','psql'))))
FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid();
COMMIT;'''


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


def filter_db_sample(value: dict) -> dict:
    def count(number: Any) -> int:
        if type(number) is not int or not 0 <= number <= 1000000:
            raise ValueError('invalid_diagnostic_protocol')
        return number
    if not isinstance(value, dict):
        raise ValueError('invalid_diagnostic_protocol')
    result = {'total': count(value.get('total'))}
    for group, names in DB_GROUPS.items():
        source = value.get(group)
        if not isinstance(source, dict):
            raise ValueError('invalid_diagnostic_protocol')
        result[group] = {name: count(source.get(name)) for name in names}
        if sum(result[group].values()) != result['total']:
            raise ValueError('invalid_diagnostic_protocol')
    return result


def database_samples() -> dict:
    try:
        ids = capture(['docker', 'ps', '-q', '--no-trunc', '--filter',
            'label=com.docker.compose.project.working_dir=/opt/washflow', '--filter',
            'label=com.docker.compose.service=postgres']).decode('ascii').split()
        if len(ids) != 1 or not re.fullmatch(r'[0-9a-f]{64}', ids[0]):
            raise ValueError('ambiguous_database_container')
        samples = []
        for index in range(3):
            if index:
                time.sleep(1)
            raw = capture(['docker', 'exec', '-i', ids[0], 'sh', '-c', PG_COMMAND],
                          data=CLIENT_COUNTS_SQL, timeout=8)
            samples.append(filter_db_sample(json.loads(raw)))
        return {'status': 'ok', 'samples': samples}
    except (OSError, ValueError, TypeError, UnicodeError):
        return {'status': 'unavailable', 'samples': []}


def filter_database(value: Any) -> dict:
    if not isinstance(value, dict) or value.get('status') != 'ok':
        return {'status': 'unavailable', 'samples': []}
    samples = value.get('samples')
    if not isinstance(samples, list) or len(samples) != 3:
        raise ValueError('invalid_diagnostic_protocol')
    return {'status': 'ok', 'samples': [filter_db_sample(sample) for sample in samples]}


def bounded_bytes(value: Any, unit: Any = 1) -> Optional[int]:
    if type(value) is not int or type(unit) is not int or not 0 <= value <= MAX_BYTES or not 1 <= unit <= MAX_BYTES:
        return None
    result = value * unit
    return result if result <= MAX_BYTES else None


def filter_capacity(value: Any) -> dict:
    data = value if isinstance(value, dict) else {}
    cpu = data.get('cpu_count')
    return {'cpu_count': cpu if type(cpu) is int and 1 <= cpu <= 65536 else None,
            **{name: bounded_bytes(data.get(name)) for name in CAPACITY_BYTES}}


def parse_meminfo(raw: bytes) -> dict:
    result = {name: None for name in MEMINFO_KEYS.values()}
    if not isinstance(raw, bytes) or len(raw) > 65536:
        return result
    try:
        lines = raw.decode('ascii').splitlines()
    except UnicodeError:
        return result
    selected = {key: [line.partition(':')[2] for line in lines
                     if line.partition(':')[0].strip() == key] for key in MEMINFO_KEYS}
    for key, entries in selected.items():
        if len(entries) == 1:
            match = re.fullmatch(r'[ \t]*([0-9]{1,16})[ \t]+kB[ \t]*', entries[0])
            if match:
                result[MEMINFO_KEYS[key]] = bounded_bytes(int(match.group(1)), 1024)
    return result


def host_capacity(root: Path) -> dict:
    result = filter_capacity({})
    try:
        result['cpu_count'] = os.cpu_count()
    except (OSError, ValueError):
        pass  # Unknown remains null; raw platform errors are never forwarded.
    try:
        result['sysconf_free_bytes'] = bounded_bytes(os.sysconf('SC_AVPHYS_PAGES'), os.sysconf('SC_PAGE_SIZE'))
    except (OSError, ValueError, AttributeError):
        pass
    try:
        with Path('/proc/meminfo').open('rb') as stream:
            result.update(parse_meminfo(stream.read(65537)))
    except (OSError, ValueError):
        pass
    try:
        if safe_path(root):
            disk = os.statvfs(root)
            for source, target in [('f_blocks', 'disk_total_bytes'), ('f_bfree', 'disk_free_bytes'),
                                   ('f_bavail', 'disk_available_bytes')]:
                result[target] = bounded_bytes(getattr(disk, source), disk.f_frsize)
    except (OSError, ValueError, AttributeError):
        pass
    return filter_capacity(result)


def http_get(container: str, url: str) -> str:
    if not re.fullmatch(r'[0-9a-f]{64}', container) or url not in GET_URLS:
        raise ValueError('invalid_fixed_get')
    try:
        result = subprocess.run(['docker', 'exec', container, 'wget', '-q', '-O', '-', '-T', '5', url],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8, check=False)
        return 'ok' if result.returncode == 0 else 'nonzero'
    except (OSError, subprocess.TimeoutExpired):
        return 'unavailable'


def filter_health_detail(value: dict) -> dict:
    if not isinstance(value, dict):
        raise ValueError('invalid_diagnostic_protocol')
    recent = value.get('recent', [])
    if not isinstance(recent, list) or len(recent) > 5 or not all(isinstance(x, dict) for x in recent):
        raise ValueError('invalid_diagnostic_protocol')
    return {'known_localhost_wget': value.get('known_localhost_wget') is True,
            'known_ipv4_wget': value.get('known_ipv4_wget') is True,
            'recent': [{'exit_code': x.get('exit_code') if type(x.get('exit_code')) is int
                        and -1 <= x['exit_code'] <= 255 else None,
                        'failure_class': x.get('failure_class') if x.get('failure_class') in HEALTH_CLASSES
                        else 'unknown_failure'} for x in recent],
            'localhost_get': value.get('localhost_get') if value.get('localhost_get') in GET_RESULTS else 'unavailable',
            'ipv4_get': value.get('ipv4_get') if value.get('ipv4_get') in GET_RESULTS else 'unavailable'}


def frontend_health(container: str) -> dict:
    try:
        detail = json.loads(capture(['docker', 'inspect', '--format', HEALTH_DETAIL, container]))
        detail['localhost_get'] = http_get(container, GET_URLS[0])
        detail['ipv4_get'] = http_get(container, GET_URLS[1])
        return filter_health_detail(detail)
    except (OSError, ValueError, TypeError):
        return filter_health_detail({})


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
              'release': state, 'capacity': host_capacity(root), 'database': {'status': 'unavailable', 'samples': []},
              'observed_prerequisite_refusals': refusals, 'docker_probe_ok': False}
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
            if service == 'frontend':
                report['apps'][service] = [{**app, 'healthcheck': frontend_health(container)}
                                           for app, container in zip(report['apps'][service], ids)]
        report['docker_probe_ok'] = True
        report['database'] = database_samples()
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
              'capacity': filter_capacity(value.get('capacity')),
              'database': filter_database(value.get('database')),
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
            if name == 'frontend':
                result['apps'][name][-1]['healthcheck'] = filter_health_detail(app.get('healthcheck', {}))
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
