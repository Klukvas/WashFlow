"""Small deployment primitives; subprocess output is never forwarded on failure."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import signal
import subprocess
import tarfile
import time


class Refusal(Exception):
    pass


FRONTEND_HEALTH_TEST = ('CMD', 'wget', '-qO-', 'http://127.0.0.1:80/')
LOCALHOST_TEST = json.dumps(['CMD', 'wget', '-qO-', 'http://localhost:80/'], separators=(',', ':'))
FRONTEND_HEALTH_PROOF = ('{"known_localhost_wget":{{if .Config.Healthcheck}}'
    '{{eq (json .Config.Healthcheck.Test) ' + json.dumps(LOCALHOST_TEST) + '}}{{else}}false{{end}},'
    '"recent":[{{if .State.Health}}{{range $i,$entry := .State.Health.Log}}{{if lt $i 5}}{{if $i}},{{end}}'
    '{"exit_code":{{json $entry.ExitCode}},"connection_refused":'
    '{{eq $entry.Output "wget: can\'t connect to remote host: Connection refused\\n"}}}'
    '{{end}}{{end}}{{end}}]}')


def frontend_localhost_exception(container: str) -> bool:
    """Prove only the observed legacy localhost-wget defect; never return raw health data."""
    if not re.fullmatch(r'[0-9a-f]{64}', container):
        return False
    try:
        detail = json.loads(run(['docker', 'inspect', '--format', FRONTEND_HEALTH_PROOF, container], timeout=10))
        recent = detail.get('recent')
        if (detail.get('known_localhost_wget') is not True or not isinstance(recent, list)
                or not 1 <= len(recent) <= 5 or not all(isinstance(x, dict)
                and type(x.get('exit_code')) is int and x['exit_code'] == 1
                and x.get('connection_refused') is True for x in recent)):
            return False
        with open(os.devnull, 'wb') as sink:
            run(['docker', 'exec', container, 'wget', '-q', '-O', '-', '-T', '5',
                 'http://127.0.0.1:80/'], output=sink, timeout=8)
        return True
    except (Refusal, OSError, ValueError, TypeError, AttributeError):
        return False


def parse_available_memory(raw: bytes) -> int:
    """Use Linux's available-memory metric, with no free-pages fallback or raw error output."""
    require(isinstance(raw, bytes) and len(raw) <= 65536, 'insufficient_host_capacity')
    try:
        lines = raw.decode('ascii').splitlines()
    except UnicodeError:
        raise Refusal('insufficient_host_capacity') from None
    values = {}
    for name in ['MemTotal', 'MemAvailable']:
        entries = [line.partition(':')[2] for line in lines if line.partition(':')[0].strip() == name]
        require(len(entries) == 1, 'insufficient_host_capacity')
        match = re.fullmatch(r'[ \t]*([0-9]{1,16})[ \t]+kB[ \t]*', entries[0])
        require(match is not None, 'insufficient_host_capacity')
        value = int(match.group(1)) * 1024
        require(value <= 2 ** 60, 'insufficient_host_capacity')
        values[name] = value
    require(0 < values['MemTotal'] and values['MemAvailable'] <= values['MemTotal'],
            'insufficient_host_capacity')
    return values['MemAvailable']


def linux_available_memory() -> int:
    try:
        with open('/proc/meminfo', 'rb') as stream:
            return parse_available_memory(stream.read(65537))
    except OSError:
        raise Refusal('insufficient_host_capacity') from None


def require(condition, code):
    if not condition:
        raise Refusal(code)


def run(args, *, data=None, input_file=None, output=None, timeout=60):
    # Own process groups prevent a timed-out docker/ssh child from remaining live.
    proc = subprocess.Popen(args, stdin=input_file or (subprocess.PIPE if data is not None else subprocess.DEVNULL),
                            stdout=output or subprocess.PIPE, stderr=subprocess.PIPE,
                            start_new_session=True)
    try:
        stdout, _ = proc.communicate(data, timeout=timeout)
    except BaseException:
        os.killpg(proc.pid, signal.SIGTERM)
        try:
            proc.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.communicate()
        raise Refusal('command_interrupted_or_timed_out') from None
    require(proc.returncode == 0, 'command_failed_output_withheld')
    return stdout or b''


def digest(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def catalog_hash(raw):
    value = json.loads(raw)
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def private_path(path, *, directory=False):
    p = Path(path).absolute()
    require(not any(x.is_symlink() for x in [p, *p.parents]), 'symlink_path')
    require(p.is_dir() if directory else p.is_file(), 'missing_regular_path')
    return p


def private_directory(path):
    p = private_path(path, directory=True)
    require(p.stat().st_uid == os.getuid() and p.stat().st_mode & 0o077 == 0,
            'directory_not_private_or_owned')
    return p


def save_json(path, value):
    with Path(path).open('x', encoding='utf-8') as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write('\n')


def verify_uploads(path):
    names, total = set(), 0
    with tarfile.open(path, 'r:') as archive:
        for entry in archive:
            name = PurePosixPath(entry.name)
            require(not name.is_absolute() and '..' not in name.parts, 'unsafe_upload_path')
            require(entry.isfile() or entry.isdir(), 'unsafe_upload_type')
            normalized = str(name)
            require(normalized not in names, 'duplicate_upload_path')
            names.add(normalized)
            if entry.isfile():
                stream = archive.extractfile(entry)
                require(stream is not None, 'missing_upload_bytes')
                count = 0
                for block in iter(lambda: stream.read(1024 * 1024), b''):
                    count += len(block)
                require(count == entry.size, 'truncated_upload')
                total += count
    return {'members': len(names), 'file_bytes': total}


def wait_until(check, *, seconds=120, interval=2):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if check():
            return
        time.sleep(interval)
    raise Refusal('health_deadline_exceeded')
