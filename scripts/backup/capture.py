"""Capture the existing node-only Compose backend, then resume BEFORE packaging."""
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import signal
import tarfile
import time

import backup
from runtime import Refused, digest, private, record, require, run

META = ('{"id":{{json .Id}},"image":{{json .Image}},"running":{{json .State.Running}},'
        '"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}"missing"{{end}},'
        '"command":{{json .Config.Cmd}},"mounts":{{json .Mounts}},'
        '"project":{{json (index .Config.Labels "com.docker.compose.project")}},'
        '"service":{{json (index .Config.Labels "com.docker.compose.service")}},'
        '"directory":{{json (index .Config.Labels "com.docker.compose.project.working_dir")}}}')


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_uploads(raw: Path, target: Path) -> None:
    # Validate the whole Docker archive before creating a normalized output.
    with tarfile.open(raw, "r:") as source:
        entries = source.getmembers()
        normalized = []
        for entry in entries:
            name = entry.name
            while name.startswith("./"):
                name = name[2:]
            if name in ("", ".") and entry.isdir():
                continue
            normalized.append((entry, name, entry.isfile(), entry.isdir()))
        backup.validate_archive_entries([(name, is_file, is_dir)
                                          for _, name, is_file, is_dir in normalized])
        copies = []
        for entry, name, _, is_dir in normalized:
            copy = tarfile.TarInfo(name)
            copy.type, copy.size, copy.mode = entry.type, entry.size, 0o700 if is_dir else 0o600
            copies.append((entry, copy))
        with tarfile.open(target, "x:gz") as archive:
            for original, copy in copies:
                if copy.isdir():
                    archive.addfile(copy)
                else:
                    stream = source.extractfile(original)
                    require(stream is not None, "missing_upload_bytes")
                    with stream:
                        archive.addfile(copy, stream)


class Capture:
    def __init__(self, root: Path, destination: Path, docker: list[str], database: str) -> None:
        self.root, self.destination, self.docker = root.absolute(), destination, docker
        self.database = database
        require(backup.IDENTIFIER.fullmatch(self.database), "invalid_database_name")
        self.stopping = False
        self.stop_acknowledged = False
        self.original: dict = {}

    def auth(self) -> str:
        # The dump runs inside the postgres container; the superuser role comes from
        # the container's own POSTGRES_USER, but the target database is explicit and
        # never falls back to a default connection.
        return '-U "${POSTGRES_USER:-postgres}" -d ' + self.database

    def command(self, *args: str, **kwargs) -> bytes:
        return run([*self.docker, *args], **kwargs)

    def inspect(self, cid: str, *, timeout: float = 120) -> dict:
        return json.loads(self.command("inspect", "--format", META, cid, timeout=timeout))

    def containers(self) -> list[dict]:
        ids = self.command("ps", "-aq").decode().split()
        return [self.inspect(cid) for cid in ids]

    def sql(self, query: bytes) -> bytes:
        return self.command("exec", "-i", self.pg["id"], "sh", "-c",
                            "exec psql -XqAt --no-password -v ON_ERROR_STOP=1 " + self.auth(),
                            data=b"BEGIN READ ONLY; SET LOCAL statement_timeout='20s';\n" + query + b"\nCOMMIT;")

    def identity(self, *, timeout: float = 120) -> dict:
        current = self.inspect(self.original["id"], timeout=timeout)
        for key in ("id", "image", "command", "mounts", "project", "service", "directory"):
            require(current[key] == self.original[key], "backend_identity_changed")
        return current

    def writers(self, *, stopped: bool) -> None:
        current = self.containers()
        active = [c for c in current if c["running"]]
        project = [c for c in active if c["project"] == self.original["project"]]
        expected = {"postgres", "redis", "frontend"} | (set() if stopped else {"backend"})
        require(len(project) == len(expected) and {c["service"] for c in project} == expected,
                "unexpected_project_writers")
        for c in active:
            if c["id"] != self.original["id"]:
                require(c["image"] != self.original["image"], "other_backend_writer")
                require(not any(m["Source"] == self.upload["Source"] for m in c["mounts"]),
                        "other_upload_writer")
        require(self.inspect(self.pg["id"])["image"] == self.pg["image"], "postgres_identity_changed")
        if stopped:
            clients = self.sql(b"SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()"
                               b" AND pid<>pg_backend_pid() AND backend_type='client backend';").strip()
            require(clients == b"0", "other_database_clients")

    def preflight(self) -> None:
        private(self.root / "releases", directory=True)
        private(self.destination, directory=True)
        require(not self.destination.is_relative_to(self.root / "uploads"), "unsafe_backup_destination")
        all_containers = self.containers()
        apps = [c for c in all_containers if c["running"] and c["service"] == "backend"
                and c["directory"] == str(self.root)]
        require(len(apps) == 1, "single_backend_required")
        self.original = apps[0]
        require(self.original["command"] == ["node", "dist/main.js"], "node_only_backend_required")
        require(bool(re.fullmatch(r"sha256:[0-9a-f]{64}", self.original["image"])), "immutable_image_required")
        project = [c for c in all_containers if c["running"] and c["project"] == self.original["project"]]
        require(len(project) == 4 and {c["service"] for c in project} ==
                {"backend", "frontend", "postgres", "redis"}, "unexpected_project_topology")
        require(all(c["health"] == "healthy" and c["directory"] == str(self.root) for c in project),
                "healthy_existing_stack_required")
        self.pg = next(c for c in project if c["service"] == "postgres")
        mounts = self.original["mounts"]
        require(len(mounts) == 1 and mounts[0]["Type"] == "volume" and mounts[0]["RW"]
                and mounts[0]["Destination"] == "/app/uploads", "known_upload_volume_required")
        self.upload = mounts[0]
        require(not self.destination.resolve().is_relative_to(Path(self.upload["Source"]).resolve()),
                "backup_inside_upload_volume")
        self.writers(stopped=False)
        info = json.loads(self.sql(b"SELECT json_build_object('major',current_setting('server_version_num')::int/10000,"
                                  b"'database',current_database(),'bytes',pg_database_size(current_database()));"))
        require(info["major"] == 16 and info["database"] == self.database, "postgres16_required")
        for tool in ("pg_dump", "pg_restore", "psql"):
            require(re.search(rb"\(PostgreSQL\) 16\.", self.command("exec", self.pg["id"], tool, "--version")),
                    "postgres16_clients_required")
        size = int(self.command("exec", self.original["id"], "du", "-sk", "/app/uploads").split()[0]) * 1024
        require(shutil.disk_usage(self.destination).free >= 8 * (info["bytes"] + size) + 1024**3,
                "insufficient_backup_disk")

    def resume(self) -> None:
        # One deadline covers ALL inspections, stop settlement, start and health.
        # Leave 10s for child cleanup and another 60s before the supervisor's 6min
        # grace for failure records/signal restoration; commands never reset it.
        deadline = time.monotonic() + 300

        def budget(cap: float) -> float:
            remaining = deadline - time.monotonic() - 10
            require(remaining > 0, "backend_recovery_deadline_exceeded")
            return min(cap, remaining)

        current = self.identity(timeout=budget(120))
        if not self.stop_acknowledged:
            # Docker daemon stop continues after a client timeout/disconnect. A
            # still-healthy inspection is not completion: obtain a bounded stop
            # acknowledgement before starting, even if it already appears stopped.
            self.command("stop", "--time", "45", self.original["id"], timeout=budget(60))
            current = self.identity(timeout=budget(120))
            require(not current["running"], "backend_stop_not_settled")
            self.stop_acknowledged = True
        if not current["running"]:
            self.command("start", self.original["id"], timeout=budget(60))
        while time.monotonic() < deadline:
            current = self.identity(timeout=budget(120))
            budget(120)  # Never report health success after exhausting the shared budget.
            if current["running"] and current["health"] == "healthy":
                return
            time.sleep(min(2, budget(2)))
        raise Refused("backend_resume_health_failed")

    def recovery_identity(self) -> dict:
        require(bool(re.fullmatch(r"[0-9a-f]{64}", self.original["id"])), "invalid_backend_id")
        require(bool(re.fullmatch(r"sha256:[0-9a-f]{64}", self.original["image"])), "invalid_backend_image")
        require(self.original["command"] == ["node", "dist/main.js"]
                and self.original["service"] == "backend"
                and self.original["directory"] == str(self.root)
                and bool(re.fullmatch(r"[a-z0-9][a-z0-9_-]*", self.original["project"])),
                "invalid_recovery_identity")
        mounts = self.original["mounts"]
        require(len(mounts) == 1 and mounts[0]["Type"] == "volume" and mounts[0]["RW"] is True
                and mounts[0]["Destination"] == "/app/uploads"
                and isinstance(mounts[0]["Source"], str) and Path(mounts[0]["Source"]).is_absolute(),
                "invalid_recovery_mount")
        return {**{key: self.original[key] for key in ("id", "image", "command", "project", "service", "directory")},
                "mounts": [{key: mounts[0][key] for key in ("Type", "Source", "Destination", "RW")}]}

    def capture(self) -> Path:
        # Shared byte-for-byte lock path with scripts/deploy/remote.py.
        private(self.root / "releases", directory=True)
        lock = self.root / "releases/.deploy.lock"
        fd = os.open(lock, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "r+") as stream:
            private(lock)
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.preflight()
            started = now()
            try:
                self.identity()
                self.writers(stopped=False)
                # Persist the exact recovery target BEFORE any stop attempt. Failure
                # to fsync either the file or its directory leaves backend untouched.
                record(self.destination / "pre-stop.json", {"format": "washflow-backup-recovery-v1",
                       "at": now(), "backend": self.recovery_identity()}, durable=True)
                self.stopping = True  # Also recover a partial/timeout stop.
                self.command("stop", "--time", "45", self.original["id"], timeout=60)
                require(not self.identity()["running"], "backend_not_stopped")
                self.stop_acknowledged = True
                self.writers(stopped=True)
                with os.fdopen(os.open(self.destination / "database.dump",
                                       os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), "wb") as output:
                    self.command("exec", self.pg["id"], "sh", "-c",
                                 "exec pg_dump --format=custom --no-owner --no-acl --no-password " + self.auth(),
                                 output=output, timeout=1800)
                with os.fdopen(os.open(self.destination / "uploads.docker.tar",
                                       os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), "wb") as output:
                    self.command("cp", self.original["id"] + ":/app/uploads/.", "-",
                                 output=output, timeout=1800)
                self.writers(stopped=True)
            finally:
                if self.stopping:
                    # A second TERM must not interrupt bounded recovery. SIGKILL/reboot
                    # cannot execute finally: the supervisor/runbook must recover instead.
                    previous = {s: signal.signal(s, signal.SIG_IGN) for s in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP)}
                    try:
                        self.resume()
                        record(self.destination / "resume.json", {"status": "success", "at": now(),
                               "backend_id": self.original["id"], "image": self.original["image"]})
                    except BaseException:
                        record(self.destination / "resume-failed.json", {"status": "failed", "at": now()})
                        raise Refused("BACKEND_RESUME_FAILED_OPERATOR_REQUIRED") from None
                    finally:
                        for sig, handler in previous.items():
                            signal.signal(sig, handler)
            record(self.destination / "capture.json", {"status": "success", "started_at": started,
                   "resumed_at": now(), "backend_id": self.original["id"], "image": self.original["image"]})
        # App is healthy and deployment lock is released before compression/encryption/network.
        normalize_uploads(self.destination / "uploads.docker.tar", self.destination / "uploads.tar.gz")
        with (self.destination / "database.dump").open("rb") as source:
            self.command("exec", "-i", self.pg["id"], "pg_restore", "--list", input_file=source, timeout=120)
        record(self.destination / "manifest.json", {"format": "washflow-local-v1", "postgres_major": 16,
               "created_at": started, "source_database": self.database,
               "consistency": "operator-confirmed-quiesced", "files": {
                   name: {"bytes": (self.destination / name).stat().st_size, "sha256": digest(self.destination / name)}
                   for name in backup.FILES}})
        backup.verify(self.destination)
        return self.destination
