#!/usr/bin/env python3
"""Explicit synthetic PostgreSQL 16 roundtrip. No .env, host ports or shared volumes."""

import argparse
import json
import logging
import os
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CLI = ROOT / "scripts/backup/backup.py"


def run(command: list[str], *, data: bytes | None = None, success: bool = True) -> bytes:
    result = subprocess.run(command, input=data, capture_output=True, timeout=120, check=False)
    if (result.returncode == 0) != success:
        raise RuntimeError(f"Unexpected command result: {result.stderr.decode(errors='replace')}")
    return result.stdout + result.stderr


def exercise(directory: Path, docker: list[str], container: str) -> None:
    wrappers = directory / "pg16"
    wrappers.mkdir()
    for tool in ("pg_dump", "pg_restore", "psql"):
        wrapper = wrappers / tool
        wrapper.write_text("#!/bin/sh\nexec " + shlex.join(
            [*docker, "exec", "-i", container, tool]) + ' "$@"\n')
        wrapper.chmod(0o700)
    source = "washflow_backup_source_" + uuid.uuid4().hex[:12]
    target = "washflow_restore_" + uuid.uuid4().hex[:12]
    postgres = [*docker, "exec", "-i", container, "psql", "-XAt", "-v", "ON_ERROR_STOP=1",
                "-U", "postgres", "-d"]
    run([*postgres, "postgres"], data=f'CREATE DATABASE "{source}";'.encode())
    uploads = directory / "source-uploads"
    (uploads / "vehicles").mkdir(parents=True)
    photo = b"washflow synthetic photo fixture\x00\xff"
    (uploads / "vehicles/photo.bin").write_bytes(photo)
    run([*postgres, source], data=b"""
      CREATE TABLE tenants (id text PRIMARY KEY, name text NOT NULL);
      CREATE TABLE vehicles (id text PRIMARY KEY, tenant_id text REFERENCES tenants(id),
        photo_url text, amount numeric(12,2), created_at timestamptz);
      CREATE TABLE idempotency_keys (key text PRIMARY KEY, result jsonb);
      INSERT INTO tenants VALUES ('fixture', 'Synthetic tenant');
      INSERT INTO vehicles VALUES ('car', 'fixture', '/uploads/vehicles/photo.bin',
        1234.56, '2026-10-25T12:34:56.789+00:00');
      INSERT INTO idempotency_keys VALUES ('fixture-key', '{"synthetic": true}');
    """)
    query = b"""SELECT row_to_json(t) FROM tenants t ORDER BY id;
      SELECT row_to_json(v) FROM vehicles v ORDER BY id;
      SELECT row_to_json(i) FROM idempotency_keys i ORDER BY key;"""
    expected = run([*postgres, source], data=query)
    common = [sys.executable, "-B", str(CLI)]
    connection = ["--host", "127.0.0.1", "--port", "5432", "--user", "postgres",
                  "--pg-bin", str(wrappers)]
    bundle = directory / "bundle"
    record = directory / "attempt.json"
    logging.info("WIP role=DEVELOPER phase=verify action=synthetic backup + restore")
    run([*common, "backup", *connection, "--database", source, "--uploads", str(uploads),
         "--bundle", str(bundle), "--record", str(record), "--confirm-quiesced"])
    if json.loads(record.read_text())["status"] != "success":
        raise RuntimeError("Successful backup did not record success")
    failed_record = directory / "failed-attempt.json"
    run([*common, "backup", *connection, "--database", source, "--uploads", str(uploads),
         "--bundle", str(directory / "never-created"), "--record", str(failed_record)], success=False)
    if json.loads(failed_record.read_text())["status"] != "failed":
        raise RuntimeError("Refused backup did not record failure")
    logging.info(run([*common, "verify", "--bundle", str(bundle)]).decode().strip())
    restored = directory / "restored-uploads"
    restore = [*common, "restore", *connection, "--database", target, "--uploads", str(restored),
               "--bundle", str(bundle), "--approve-target", f"127.0.0.1:5432/{target}"]
    logging.info(run(restore).decode().strip())
    if run([*postgres, target], data=query) != expected:
        raise RuntimeError("Database row roundtrip mismatch")
    if (restored / "vehicles/photo.bin").read_bytes() != photo:
        raise RuntimeError("Uploads byte roundtrip mismatch")
    # Exercise real refusal paths; verify they leave the restored state untouched.
    unsafe = [*restore[:-1], "not-approved"]
    if b"exact --approve-target" not in run(unsafe, success=False):
        raise RuntimeError("Unapproved restore was not refused correctly")
    existing_db = [str(directory / "fresh-uploads") if item == str(restored) else item for item in restore]
    if b"database already exists" not in run(existing_db, success=False):
        raise RuntimeError("Existing database was not refused")
    if (directory / "fresh-uploads").exists():
        raise RuntimeError("Refused restore wrote uploads")
    if b"Uploads target must not exist" not in run(restore, success=False):
        raise RuntimeError("Existing uploads were not refused")
    corrupt = directory / "corrupt-bundle"
    shutil.copytree(bundle, corrupt)
    with (corrupt / "database.dump").open("ab") as stream:
        stream.write(b"synthetic corruption")
    corrupt_restore = [str(corrupt) if item == str(bundle) else item for item in restore]
    if b"checksum" not in run(corrupt_restore, success=False):
        raise RuntimeError("Corruption was not refused")
    if run([*postgres, target], data=query) != expected:
        raise RuntimeError("Refusal checks changed restored rows")
    if (restored / "vehicles/photo.bin").read_bytes() != photo:
        raise RuntimeError("Refusal checks changed restored uploads")
    logging.info("DRILL PASS: 3 tables / 3 rows + upload bytes; 4 restore refusals; success/failure records; source=%s target=%s",
                 source, target)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-synthetic", action="store_true", required=True)
    args = parser.parse_args()
    del args
    os.umask(0o077)
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    binary = shutil.which("docker")
    if not binary:
        raise SystemExit("BLOCKED: Docker is required; no fallback to any database")
    context = run([binary, "context", "show"]).decode().strip()
    docker = [binary, "--context", context]
    endpoint = run([*docker, "context", "inspect", context, "--format", "{{json .Endpoints.docker.Host}}"])
    if not json.loads(endpoint).startswith("unix://"):
        raise SystemExit("REFUSED: drill requires a local Unix-socket Docker context")
    container = "washflow-backup-drill-" + uuid.uuid4().hex
    logging.info("WIP role=DEVELOPER phase=verify action=start isolated %s (no host ports)", container)
    # --pull=never prevents network/image installation; --network=none isolates trust auth.
    # --rm + tmpfs avoid persistent data volumes. Cleanup is only for this exact created ID.
    created_id = run([*docker, "run", "--pull=never", "--detach", "--rm", "--network=none",
                      "--name", container, "--tmpfs", "/var/lib/postgresql/data:rw",
                      "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:16-alpine"]).decode().strip()
    try:
        for _ in range(30):
            ready = subprocess.run([*docker, "exec", container, "pg_isready", "-U", "postgres"],
                                   capture_output=True, timeout=10, check=False)
            if ready.returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError("Synthetic PostgreSQL did not become ready in 30 seconds")
        with tempfile.TemporaryDirectory(prefix="drill-", dir=Path(__file__).parent) as temporary:
            exercise(Path(temporary), docker, container)
    finally:
        run([*docker, "stop", "--time", "5", created_id])
        logging.info("CLEANUP OK: removed only task-owned container and fixture directory")


if __name__ == "__main__":
    main()
