#!/usr/bin/env python3
"""One explicit operator-configured capture/encrypt/offsite attempt; no installation."""
import argparse
from datetime import datetime, timezone
import fcntl
import json
import logging
import os
from pathlib import Path
import re
import signal
import subprocess
import tarfile
import uuid

from capture import Capture
from offsite import Storage, gpg, publish
from runtime import Refused, fresh, local_docker, private, record, require, run

FIELDS = {"root", "backup_root", "gpg_home", "recipient", "endpoint", "bucket", "profile", "prefix", "database"}


def interrupted(_signal: int, _frame) -> None:
    raise Refused("interrupted")


def attempt(config: dict) -> Path:
    require(set(config) == FIELDS and all(isinstance(value, str) and value for value in config.values()),
            "invalid_config")
    root = private(Path(config["backup_root"]), directory=True)
    fd = os.open(root / ".backup.lock", os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "r+") as lock:
        private(root / ".backup.lock")
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return locked_attempt(config)


def locked_attempt(config: dict) -> Path:
    # Validate destination and recipient before any outage. No remote command is run here.
    storage = Storage(config["endpoint"], config["bucket"], config["profile"], config["prefix"])
    require(bool(re.fullmatch(r"(?:[A-F0-9]{40}|[A-F0-9]{64})", config["recipient"])), "invalid_recipient")
    run(gpg(Path(config["gpg_home"]), "--list-keys", config["recipient"]))
    destination = fresh(Path(config["backup_root"]), uuid.uuid4().hex)
    capture = fresh(destination, "capture")
    work = fresh(destination, "offsite")
    phase = "capture"
    record(destination / "attempt-started.json", {"status": "running", "started_at": datetime.now(timezone.utc).isoformat()})
    try:
        Capture(Path(config["root"]), capture, local_docker(), config["database"]).capture()
        phase = "offsite"
        publish(capture, work, Path(config["gpg_home"]), config["recipient"], storage)
        record(destination / "attempt-success.json", {"status": "success", "phase": "offsite_readback_verified"})
        return destination
    except BaseException:
        record(destination / "attempt-failed.json", {"status": "failed", "phase": phase})
        raise


def main() -> None:
    os.umask(0o077)
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    parser.add_argument("--approve-capture", required=True,
                        help="Exact approved source root; stops its backend briefly")
    args = parser.parse_args()
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(sig, interrupted)
    try:
        config = json.loads(private(Path(args.config)).read_text())
        require(isinstance(config, dict) and config.get("root") == args.approve_capture,
                "exact_capture_approval_required")
        result = attempt(config)
        logging.info("BACKUP OFFSITE READBACK OK: %s", result)
    except (ValueError, OSError, subprocess.SubprocessError, tarfile.TarError) as error:
        # Exception strings may contain paths/provider output; private records preserve phase.
        logging.error("BACKUP FAILED (%s): inspect attempt/resume records; no offsite success", type(error).__name__)
        if isinstance(error, Refused) and str(error) == "BACKEND_RESUME_FAILED_OPERATOR_REQUIRED":
            logging.error("BACKEND RESUME FAILED: OPERATOR RECOVERY REQUIRED")
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
