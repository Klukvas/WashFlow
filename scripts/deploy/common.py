"""Small deployment primitives; subprocess output is never forwarded on failure."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import signal
import subprocess
import tarfile
import time


class Refusal(Exception):
    pass


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
