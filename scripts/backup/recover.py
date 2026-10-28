#!/usr/bin/env python3
"""Download/decrypt a trusted receipt's object and restore in an isolated PG16 container."""
import argparse
import hashlib
import json
import logging
import os
from pathlib import Path
import shlex
import signal
import subprocess
import tarfile
import time
import uuid

import backup
from offsite import Storage, download_verified
from runtime import Refused, fresh, local_docker, private, record, require, run


def isolated_restore(bundle: Path, work: Path, docker: list[str]) -> dict:
    backup.verify(bundle)  # No container starts before GPG/download/bundle validation.
    name = "washflow-recovery-check-" + uuid.uuid4().hex
    cid = run([*docker, "run", "--pull=never", "--detach", "--rm", "--network=none", "--name", name,
               "--tmpfs", "/var/lib/postgresql/data:rw,size=8g",
               "--memory", "4g", "--memory-swap", "4g", "--pids-limit", "512",
               "--security-opt", "no-new-privileges",
               "--cap-drop", "ALL", "--cap-add", "CHOWN", "--cap-add", "DAC_OVERRIDE",
               "--cap-add", "FOWNER", "--cap-add", "SETUID", "--cap-add", "SETGID",
               "-e", "POSTGRES_HOST_AUTH_METHOD=trust",
               "postgres:16-alpine"]).decode().strip()
    try:
        for _ in range(30):
            result = subprocess.run([*docker, "exec", cid, "pg_isready", "-U", "postgres"],
                                    capture_output=True, timeout=10, check=False)
            if result.returncode == 0:
                break
            time.sleep(1)
        else:
            raise ValueError("isolated_postgres_not_ready")
        wrappers = fresh(work, "pg16")
        for tool in ("pg_dump", "pg_restore", "psql"):
            path = wrappers / tool
            with path.open("x") as stream:
                stream.write("#!/bin/sh\nexec " + shlex.join([*docker, "exec", "-i", cid, tool]) + ' "$@"\n')
            path.chmod(0o700)
        database = "washflow_restore_" + uuid.uuid4().hex[:16]
        args = argparse.Namespace(bundle=str(bundle), host="127.0.0.1", port=5432, user="postgres",
                                  database=database, uploads=str(work / "restored-uploads"),
                                  pg_bin=str(wrappers), passfile=None, timeout_seconds=1800,
                                  approve_target=f"127.0.0.1:5432/{database}")
        backup.restore(args)
        count = run([*docker, "exec", "-i", cid, "psql", "-XqAt", "-U", "postgres", "-d", database,
                     "-v", "ON_ERROR_STOP=1"], data=b"BEGIN READ ONLY; SELECT count(*) FROM pg_tables"
                     b" WHERE schemaname='public'; COMMIT;").strip()
        require(count.isdigit() and int(count) > 0, "restored_database_has_no_public_tables")
        # Verify every extracted upload byte, not only tar or dump listing success.
        with tarfile.open(bundle / "uploads.tar.gz", "r:gz") as archive:
            for entry in archive:
                if entry.isfile():
                    source = archive.extractfile(entry)
                    require(source is not None, "missing_upload_bytes")
                    with source, (Path(args.uploads) / entry.name).open("rb") as actual:
                        require(hashlib.file_digest(source, "sha256").digest() ==
                                hashlib.file_digest(actual, "sha256").digest(), "restored_upload_mismatch")
        report = {"format": "washflow-isolated-restore-v1", "status": "success", "postgres_major": 16,
                  "public_tables": int(count), "verification": "transactional_restore_and_all_upload_bytes"}
        record(work / "restore-success.json", report)
        return report
    finally:
        run([*docker, "stop", "--time", "5", cid], timeout=30)


def main() -> None:
    os.umask(0o077)
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("receipt", "profile", "gpg-home", "work-root"):
        parser.add_argument("--" + name, required=True)
    args = parser.parse_args()
    def interrupted(_sig: int, _frame) -> None:
        raise Refused("restore_check_interrupted")
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(sig, interrupted)
    try:
        receipt = json.loads(private(Path(args.receipt)).read_text())
        require(receipt.get("format") == "washflow-offsite-v1" and receipt.get("status") == "success",
                "trusted_success_receipt_required")
        storage = Storage(receipt["endpoint"], receipt["bucket"], args.profile, receipt["key"].rsplit("/", 1)[0])
        work = fresh(Path(args.work_root), uuid.uuid4().hex)
        bundle = download_verified(storage, receipt["key"], receipt["sha256"], work, Path(args.gpg_home))
        isolated_restore(bundle, work, local_docker())
        logging.info("ISOLATED DOWNLOADED BACKUP RESTORE OK: %s", work)
    except (ValueError, OSError, KeyError, subprocess.SubprocessError, tarfile.TarError) as error:
        logging.error("RESTORE CHECK FAILED (%s); production untouched", type(error).__name__)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
