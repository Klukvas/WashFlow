"""Bounded, quiet subprocesses and private task-owned backup paths."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import stat
import subprocess


class Refused(ValueError):
    """An allowlisted operational failure, safe for unattended logs."""


def require(ok: bool, code: str) -> None:
    if not ok:
        raise Refused(code)


def binary(name: str) -> str:
    """Resolve a dependency to an absolute path so a PATH-injected binary cannot run."""
    resolved = shutil.which(name)
    require(resolved is not None and os.path.isabs(resolved), name + "_not_on_path")
    return resolved


def private(path: Path, *, directory: bool = False) -> Path:
    path = path.absolute()
    # Open every component with O_NOFOLLOW and verify from the descriptor, so a
    # swapped symlink is detected atomically instead of via a racy is_symlink()
    # then-use check. The leaf must be owned by the caller and fully private
    # (0o077-clean). Callers combine this with atomic O_EXCL/O_NOFOLLOW creates.
    current = Path(path.anchor)
    parts = path.relative_to(path.anchor).parts
    count = len(parts)
    for index, component in enumerate(parts):
        current = current / component
        leaf = index == count - 1
        flags = os.O_RDONLY | os.O_NOFOLLOW
        if not leaf or directory:
            flags |= os.O_DIRECTORY
        try:
            descriptor = os.open(current, flags)
        except OSError:
            raise Refused("unsafe_path") from None
        try:
            info = os.fstat(descriptor)
        finally:
            os.close(descriptor)
        if leaf:
            require(info.st_uid == os.getuid(), "path_must_be_owned")
            require(info.st_mode & 0o077 == 0, "path_must_be_private_and_owned")
            require(stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode),
                    "missing_path")
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
    docker = binary("docker")
    context = run([docker, "context", "show"]).decode().strip()
    endpoint = json.loads(run([docker, "context", "inspect", context, "--format",
                               "{{json .Endpoints.docker.Host}} "]))
    require(isinstance(endpoint, str) and endpoint.startswith("unix://"), "local_docker_required")
    return [docker, "--context", context]
