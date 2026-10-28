"""Bounded, quiet subprocesses and private task-owned backup paths."""
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess


class Refused(ValueError):
    """An allowlisted operational failure, safe for unattended logs."""


def require(ok: bool, code: str) -> None:
    if not ok:
        raise Refused(code)


def private(path: Path, *, directory: bool = False) -> Path:
    path = path.absolute()
    require(not any(p.is_symlink() for p in [path, *path.parents]), "unsafe_path")
    require(path.is_dir() if directory else path.is_file(), "missing_path")
    require(path.stat().st_uid == os.getuid() and path.stat().st_mode & 0o077 == 0,
            "path_must_be_private_and_owned")
    return path


def fresh(parent: Path, name: str) -> Path:
    private(parent, directory=True)
    path = parent / name
    path.mkdir(mode=0o700)
    sync_directory(parent)
    return path


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def sync_directory(path: Path) -> None:
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def record(path: Path, value: dict, *, durable: bool = False) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(value, stream, sort_keys=True)
        stream.write("\n")
        if durable:
            stream.flush()
            os.fsync(stream.fileno())
    if durable:
        sync_directory(path.parent)


def run(command: list[str], *, data: bytes | None = None, input_file=None, output=None,
        timeout: int = 120, env: dict[str, str] | None = None) -> bytes:
    proc = subprocess.Popen(command, stdin=input_file or (subprocess.PIPE if data is not None else subprocess.DEVNULL),
                            stdout=output or subprocess.PIPE, stderr=subprocess.PIPE,
                            env=env, start_new_session=True)
    try:
        stdout, _ = proc.communicate(data, timeout=timeout)
    except BaseException:
        os.killpg(proc.pid, signal.SIGTERM)
        try:
            proc.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.communicate()
        raise
    require(proc.returncode == 0, "child_failed_output_withheld")
    return stdout or b""


def local_docker() -> list[str]:
    context = run(["docker", "context", "show"]).decode().strip()
    endpoint = json.loads(run(["docker", "context", "inspect", context, "--format",
                               "{{json .Endpoints.docker.Host}} "]))
    require(isinstance(endpoint, str) and endpoint.startswith("unix://"), "local_docker_required")
    return ["docker", "--context", context]
