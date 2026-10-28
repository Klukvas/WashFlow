#!/usr/bin/env python3
"""Local PostgreSQL 16 + quiesced uploads backup; never overwrite restore targets."""

import argparse
import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
import tarfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

FILES = ("database.dump", "uploads.tar.gz")
IDENTIFIER = re.compile(r"[a-z][a-z0-9_]{0,62}\Z")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def new_directory(path: Path) -> Path:
    require(not path.is_symlink() and not path.exists(), "Directory already exists")
    path.mkdir(mode=0o700)
    return path.resolve()


def validate_archive_entries(entries: list[tuple[str, bool, bool]]) -> None:
    """Reject traversal, absolute paths, backslashes, links/special files, duplicate
    names and file/directory path conflicts. `entries` are (name, is_file, is_dir)."""
    names = [name for name, _, _ in entries]
    require(len(names) == len(set(names)), "Duplicate upload archive entries")
    paths: list[PurePosixPath] = []
    files: set[PurePosixPath] = set()
    for name, is_file, is_dir in entries:
        path = PurePosixPath(name)
        require(
            bool(path.parts)
            and not path.is_absolute()
            and ".." not in path.parts
            and "\\" not in name
            and str(path) == name.rstrip("/")
            and (is_file or is_dir),
            "Unsafe upload archive entry (paths, links and special files rejected)",
        )
        paths.append(path)
        if is_file:
            files.add(path)
    require(not any(parent in files for path in paths for parent in path.parents),
            "Upload archive file/directory conflict")


def archive_members(archive: tarfile.TarFile) -> list[tarfile.TarInfo]:
    members = archive.getmembers()
    validate_archive_entries([(member.name, member.isfile(), member.isdir()) for member in members])
    return members


def verify(bundle: Path) -> dict:
    require(bundle.is_dir() and not bundle.is_symlink(), "Invalid backup directory")
    manifest = bundle / "manifest.json"
    require(manifest.is_file() and not manifest.is_symlink(), "Missing manifest")
    metadata = json.loads(manifest.read_text())
    require(
        isinstance(metadata, dict)
        and metadata.get("format") == "washflow-local-v1"
        and metadata.get("postgres_major") == 16
        and metadata.get("consistency") == "operator-confirmed-quiesced"
        and isinstance(metadata.get("created_at"), str)
        and isinstance(metadata.get("source_database"), str)
        and bool(IDENTIFIER.fullmatch(metadata["source_database"]))
        and isinstance(metadata.get("files"), dict)
        and set(metadata["files"]) == set(FILES),
        "Unsupported or incomplete manifest",
    )
    require(datetime.fromisoformat(metadata["created_at"]).tzinfo is not None,
            "Manifest timestamp must include timezone")
    for name in FILES:
        path = bundle / name
        entry = metadata["files"][name]
        require(path.is_file() and not path.is_symlink(), "Missing backup payload")
        require(
            isinstance(entry, dict)
            and entry.get("bytes") == path.stat().st_size
            and entry.get("sha256") == digest(path),
            "Backup checksum or size mismatch",
        )
    with (bundle / FILES[0]).open("rb") as stream:
        require(stream.read(5) == b"PGDMP", "Expected PostgreSQL custom-format dump")
    with tarfile.open(bundle / FILES[1], "r:gz") as archive:
        archive_members(archive)
    return metadata


def pg_environment(passfile: str | None) -> dict[str, str]:
    # No inherited service, host, options, DATABASE_URL or default ~/.pgpass fallback.
    return {
        **{key: value for key, value in os.environ.items()
           if not key.startswith("PG") and key not in ("DATABASE_URL", "REDIS_URL")},
        "PGCONNECT_TIMEOUT": "10",
        "PGPASSFILE": str(Path(passfile).resolve()) if passfile else os.devnull,
    }


def pg(args: argparse.Namespace, tool: str, options: list[str], **kwargs) -> bytes:
    binary = str(Path(args.pg_bin) / tool) if args.pg_bin else tool
    result = subprocess.run(
        [binary, *options], env=pg_environment(args.passfile),
        stdout=kwargs.pop("stdout", subprocess.PIPE), stderr=subprocess.PIPE,
        check=False, timeout=args.timeout_seconds, **kwargs,
    )
    # PostgreSQL diagnostics may contain object data. Keep them out of unattended logs.
    require(result.returncode == 0, f"{tool} failed (exit {result.returncode}); inspect locally")
    return result.stdout or b""


def connection(args: argparse.Namespace, database: str) -> list[str]:
    return ["--host", args.host, "--port", str(args.port), "--username", args.user,
            "--dbname", database, "--no-password"]


def check_connection(args: argparse.Namespace) -> None:
    require(args.host in ("127.0.0.1", "::1"), "Only explicit loopback hosts are supported")
    require(1 <= args.port <= 65535, "Invalid PostgreSQL port")
    require(bool(IDENTIFIER.fullmatch(args.database)), "Invalid database name")
    require(bool(IDENTIFIER.fullmatch(args.user)), "Invalid PostgreSQL user name")
    for tool in ("pg_dump", "pg_restore", "psql"):
        version = pg(args, tool, ["--version"])
        require(bool(re.search(rb"\(PostgreSQL\) 16\.", version)),
                f"{tool} must be PostgreSQL 16 (use --pg-bin)")
    server = pg(args, "psql", connection(args, "postgres") + ["-XAt", "-v", "ON_ERROR_STOP=1"],
                input=b"SHOW server_version_num;\n").strip()
    require(server.isdigit() and 160000 <= int(server) < 170000, "Server must be PostgreSQL 16")


def backup(args: argparse.Namespace) -> None:
    require(args.confirm_quiesced, "Stop all DB/upload writers and pass --confirm-quiesced")
    check_connection(args)
    source = Path(args.uploads)
    require(source.is_dir() and not source.is_symlink(), "Uploads must be a real directory")
    source = source.resolve()
    target = Path(args.bundle).absolute()
    require(not target.resolve().is_relative_to(source), "Backup must be outside uploads")
    paths = sorted(source.rglob("*"))
    require(all(not path.is_symlink() and (path.is_file() or path.is_dir()) for path in paths),
            "Uploads cannot contain symlinks or special files")
    bundle = new_directory(target)
    with (bundle / FILES[0]).open("xb") as stream:
        pg(args, "pg_dump", connection(args, args.database)
           + ["--format=custom", "--no-owner", "--no-privileges"], stdout=stream)
    with tarfile.open(bundle / FILES[1], "x:gz", dereference=False) as archive:
        for path in paths:
            archive.add(path, arcname=path.relative_to(source).as_posix(), recursive=False)
    with (bundle / FILES[0]).open("rb") as stream:
        pg(args, "pg_restore", ["--list"], stdin=stream)
    metadata = {
        "format": "washflow-local-v1", "postgres_major": 16,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source_database": args.database,
        "consistency": "operator-confirmed-quiesced",
        "files": {name: {"sha256": digest(bundle / name),
                         "bytes": (bundle / name).stat().st_size} for name in FILES},
    }
    with (bundle / "manifest.json").open("x") as stream:
        json.dump(metadata, stream, indent=2)
        stream.write("\n")
    verify(bundle)
    logging.info("BACKUP OK: %s", bundle)


def extract_uploads(bundle: Path, target: Path) -> None:
    with tarfile.open(bundle / FILES[1], "r:gz") as archive:
        members = archive_members(archive)
        for member in members:
            path = target / member.name
            if member.isdir():
                path.mkdir(parents=True, exist_ok=True, mode=0o700)
            else:
                path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                source = archive.extractfile(member)
                if source is None:
                    raise ValueError("Missing regular archive file payload")
                with source, path.open("xb") as output:
                    shutil.copyfileobj(source, output)


def restore(args: argparse.Namespace) -> None:
    bundle = Path(args.bundle)
    metadata = verify(bundle)
    require(args.approve_target == f"{args.host}:{args.port}/{args.database}",
            "Restore requires exact --approve-target host:port/database")
    require(args.database.startswith("washflow_restore_"),
            "Restore database must start with washflow_restore_")
    require(args.database != metadata.get("source_database"), "Cannot restore over source database")
    target = Path(args.uploads)
    require(not target.exists() and not target.is_symlink(), "Uploads target must not exist")
    check_connection(args)
    options = connection(args, "postgres") + ["-XAt", "-v", "ON_ERROR_STOP=1",
                                             "-v", f"target={args.database}"]
    exists = pg(args, "psql", options,
                input=b"SELECT 1 FROM pg_database WHERE datname = :'target';\n")
    require(not exists.strip(), "Restore database already exists (even an empty DB is refused)")
    # CREATE DATABASE also refuses a racing creator. Never DROP, --clean or reuse a target.
    target = new_directory(target)
    pg(args, "psql", options, input=b'CREATE DATABASE :"target" TEMPLATE template0;\n')
    with (bundle / FILES[0]).open("rb") as stream:
        pg(args, "pg_restore", connection(args, args.database)
           + ["--single-transaction", "--exit-on-error", "--no-owner", "--no-privileges"], input=None,
           stdin=stream)
    extract_uploads(bundle, target)
    logging.info("RESTORE OK: %s; uploads=%s", args.database, target)


def execute(args: argparse.Namespace) -> None:
    if args.command == "verify":
        verify(Path(args.bundle))
        logging.info("VERIFY OK (SHA-256 integrity, not authenticity)")
    else:
        require(1 <= args.timeout_seconds <= 86400, "Timeout must be 1–86400 seconds")
        {"backup": backup, "restore": restore}[args.command](args)


def record_attempt(args: argparse.Namespace) -> None:
    path = Path(args.record)
    require(not path.resolve().is_relative_to(Path(args.bundle).resolve()),
            "Attempt record must be outside backup bundle")
    require(not path.resolve().is_relative_to(Path(args.uploads).resolve()),
            "Attempt record must be outside uploads")
    # Exclusive creation: this command never takes ownership of an existing user file.
    with path.open("x+") as stream:
        started = datetime.now(timezone.utc).isoformat()

        def write_status(status: str) -> None:
            stream.seek(0)
            json.dump({"format": "washflow-backup-attempt-v1", "status": status,
                       "started_at": started, "updated_at": datetime.now(timezone.utc).isoformat(),
                       "bundle": str(Path(args.bundle).absolute())}, stream)
            stream.write("\n")
            stream.truncate()
            stream.flush()
            os.fsync(stream.fileno())

        write_status("running")
        try:
            execute(args)
        except BaseException:
            write_status("failed")
            raise
        write_status("success")


def main() -> None:
    os.umask(0o077)
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("backup", "restore", "verify"):
        command = commands.add_parser(name)
        command.add_argument("--bundle", required=True)
        if name == "verify":
            continue
        command.add_argument("--host", required=True)
        command.add_argument("--port", required=True, type=int)
        command.add_argument("--user", required=True)
        command.add_argument("--database", required=True)
        command.add_argument("--uploads", required=True)
        command.add_argument("--pg-bin", help="Directory containing matching PostgreSQL 16 clients")
        command.add_argument("--passfile", help="Explicit libpq password file; never use .env")
        command.add_argument("--timeout-seconds", type=int, default=3600,
                             help="Per PostgreSQL child deadline (default: 3600; maximum: 86400)")
        if name == "backup":
            command.add_argument("--confirm-quiesced", action="store_true")
            command.add_argument("--record", help="New JSON attempt record path (never overwrite)")
        else:
            command.add_argument("--approve-target", required=True)
    args = parser.parse_args()
    try:
        if args.command == "backup" and args.record:
            record_attempt(args)
        else:
            execute(args)
    except (ValueError, OSError, EOFError, tarfile.TarError, subprocess.SubprocessError) as error:
        logging.error("REFUSED/FAILED: %s", error)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
