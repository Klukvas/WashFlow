"""No real storage/credentials: transport, integrity and capture safety failures."""
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/backup"))
import capture
import offsite
import runtime
import scheduled


class FixtureBase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory(dir=Path(__file__).parent, prefix="offsite-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.root.chmod(0o700)

    def directory(self, name: str) -> Path:
        path = self.root / name
        path.mkdir(mode=0o700)
        return path

    def storage(self, **changes) -> offsite.Storage:
        return offsite.Storage(**{"endpoint": "https://objects.example.invalid", "bucket": "fixture-bucket",
                                 "profile": "fixture", "prefix": "washflow/backups", **changes})


class OffsiteTests(FixtureBase):

    def test_rejects_unsafe_destination_before_any_child(self) -> None:
        for changes in ({"endpoint": "http://unsafe.invalid"}, {"endpoint": "https://user:secret@host.invalid"},
                        {"endpoint": "https://host.invalid/?token=value"}, {"profile": ""},
                        {"prefix": "../unknown"}, {"bucket": "--option"}):
            with self.subTest(changes=changes), patch.object(offsite, "run") as child:
                with self.assertRaises(ValueError):
                    self.storage(**changes)
                child.assert_not_called()

    def test_storage_pins_profile_tls_timeouts_and_refuses_overwrite(self) -> None:
        source = self.root / "encrypted"
        source.write_bytes(b"ciphertext")
        key = "washflow/backups/" + "a" * 32 + ".tar.gpg"
        with patch.dict(os.environ, {"AWS_ACCESS_KEY_ID": "SYNTHETIC", "AWS_SECRET_ACCESS_KEY": "SYNTHETIC",
                                    "AWS_ENDPOINT_URL": "http://unsafe.invalid", "AWS_PROFILE": "wrong"}), \
                patch.object(offsite, "run", return_value=b"{}") as child:
            self.storage().put(key, source)
        args, options = child.call_args
        command = args[0]
        self.assertIn("--if-none-match", command)
        self.assertIn("*", command)
        self.assertEqual(command[command.index("--profile") + 1], "fixture")
        self.assertNotIn("--no-verify-ssl", command)
        self.assertNotIn("AWS_ACCESS_KEY_ID", options["env"])
        self.assertNotIn("AWS_SECRET_ACCESS_KEY", options["env"])
        self.assertNotIn("AWS_ENDPOINT_URL", options["env"])
        self.assertEqual(options["env"]["AWS_EC2_METADATA_DISABLED"], "true")
        self.assertEqual(options["timeout"], 1800)
        for bad in ("other/" + "a" * 32 + ".tar.gpg", "washflow/backups/../../escape"):
            with self.assertRaises(ValueError):
                self.storage().put(bad, source)

    def test_upload_or_corrupt_readback_never_records_success(self) -> None:
        for failure in ("upload", "readback"):
            work = self.directory(failure)
            storage = self.storage()
            def encrypt(_bundle, target, _home, _fingerprint):
                target.write_bytes(b"ciphertext")
            def get(_key, target):
                target.write_bytes(b"wrong")
            with patch.object(offsite, "encrypt", side_effect=encrypt), \
                    patch.object(storage, "put", side_effect=ValueError("synthetic") if failure == "upload" else None), \
                    patch.object(storage, "get", side_effect=get):
                with self.assertRaises(ValueError):
                    offsite.publish(self.root, work, self.root, "A" * 40, storage)
            self.assertFalse((work / "receipt.json").exists())

    def test_verified_readback_records_exact_object_checksum(self) -> None:
        work = self.directory("publish")
        storage = self.storage()
        with patch.object(offsite, "encrypt", side_effect=lambda _b, p, _h, _f: p.write_bytes(b"ciphertext")), \
                patch.object(storage, "put"), \
                patch.object(storage, "get", side_effect=lambda _k, p: p.write_bytes(b"ciphertext")):
            receipt = offsite.publish(self.root, work, self.root, "A" * 40, storage)
        self.assertEqual(receipt["status"], "success")
        self.assertEqual(receipt["sha256"], runtime.digest(work / "readback.tar.gpg"))

    def test_corrupt_download_never_reaches_decrypt(self) -> None:
        storage = self.storage()
        with patch.object(storage, "get", side_effect=lambda _k, p: p.write_bytes(b"tampered")), \
                patch.object(offsite, "decrypt") as decrypt:
            with self.assertRaisesRegex(ValueError, "download_checksum"):
                offsite.download_verified(storage, "washflow/backups/" + "a" * 32 + ".tar.gpg",
                                          "0" * 64, self.root, self.root)
            decrypt.assert_not_called()

    def test_failed_gpg_never_extracts_bundle(self) -> None:
        with patch.object(offsite, "gpg", return_value=["gpg"]), \
                patch.object(offsite, "run", side_effect=ValueError("integrity failure")):
            with self.assertRaises(ValueError):
                offsite.decrypt(self.root / "input", self.root, self.root)
        self.assertFalse((self.root / "bundle").exists())

    def test_gpg_disables_config_network_and_requires_full_pin(self) -> None:
        with patch.object(offsite, "run", return_value=b"gpg (GnuPG) 2.5.20\n"):
            command = offsite.gpg(self.root, "--decrypt", "fixture")
        for option in ("--no-options", "--homedir", "--no-auto-key-retrieve"):
            self.assertIn(option, command)
        with self.assertRaises(ValueError):
            offsite.encrypt(self.root, self.root / "ciphertext", self.root, "ABCD1234")

    def test_normalizer_rejects_unsafe_raw_docker_archives(self) -> None:
        for i, (name, kind) in enumerate((("../escape", tarfile.REGTYPE), ("/escape", tarfile.REGTYPE),
                                         ("link", tarfile.SYMTYPE), ("hard", tarfile.LNKTYPE),
                                         ("pipe", tarfile.FIFOTYPE))):
            raw = self.root / f"raw-{i}"
            target = self.root / f"out-{i}"
            with tarfile.open(raw, "w:") as archive:
                entry = tarfile.TarInfo(name)
                entry.type, entry.linkname = kind, "../../escape"
                archive.addfile(entry)
            with self.assertRaises(ValueError):
                capture.normalize_uploads(raw, target)
            self.assertFalse(target.exists())

    def test_normalizer_strips_docker_dot_prefix_preserves_bytes(self) -> None:
        raw, target = self.root / "raw", self.root / "normalized"
        with tarfile.open(raw, "w:") as archive:
            root = tarfile.TarInfo(".")
            root.type = tarfile.DIRTYPE
            archive.addfile(root)
            entry = tarfile.TarInfo("./photo.bin")
            entry.size = 3
            archive.addfile(entry, io.BytesIO(b"x\0y"))
        capture.normalize_uploads(raw, target)
        with tarfile.open(target, "r:gz") as archive:
            self.assertEqual(archive.getnames(), ["photo.bin"])
            self.assertEqual(archive.extractfile("photo.bin").read(), b"x\0y")


class CaptureTests(FixtureBase):
    def instance(self) -> capture.Capture:
        (self.root / "releases").mkdir(mode=0o700)
        instance = capture.Capture(self.root, self.directory("capture"), ["docker"])
        instance.original = {"id": "c" * 64, "image": "sha256:" + "a" * 64, "command": ["node", "dist/main.js"],
                             "mounts": [{"Source": str(self.root / "uploads-source"), "Type": "volume", "RW": True,
                                         "Destination": "/app/uploads"}], "project": "fixture",
                             "service": "backend", "directory": str(self.root), "running": True, "health": "healthy"}
        instance.pg = {"id": "postgres", "image": "sha256:" + "b" * 64}
        instance.upload = instance.original["mounts"][0]
        return instance

    def test_dump_failure_or_signal_resumes_before_packaging(self) -> None:
        for error in (ValueError("synthetic dump failure"), KeyboardInterrupt()):
            with self.subTest(error=type(error).__name__):
                nested = self.directory(type(error).__name__)
                (nested / "releases").mkdir(mode=0o700)
                destination = nested / "capture"
                destination.mkdir(mode=0o700)
                instance = capture.Capture(nested, destination, ["docker"])
                instance.original = {"id": "backend", "image": "sha256:" + "a" * 64}
                def command(*args, **_kwargs):
                    if args[0] == "exec":
                        raise error
                    return b""
                with patch.object(instance, "preflight"), patch.object(instance, "identity", return_value={"running": False}), \
                        patch.object(instance, "writers"), patch.object(instance, "command", side_effect=command), \
                        patch.object(instance, "resume") as resume, patch.object(instance, "recovery_identity", return_value={}), \
                        patch.object(capture, "normalize_uploads") as package:
                    instance.pg = {"id": "postgres"}
                    with self.assertRaises(type(error)):
                        instance.capture()
                    resume.assert_called_once()
                    package.assert_not_called()
                self.assertEqual(json.loads((destination / "resume.json").read_text())["status"], "success")

    def test_preflight_failure_never_stops_or_resumes(self) -> None:
        instance = self.instance()
        with patch.object(instance, "preflight", side_effect=ValueError("unknown startup")), \
                patch.object(instance, "command") as command, patch.object(instance, "resume") as resume:
            with self.assertRaises(ValueError):
                instance.capture()
            command.assert_not_called()
            resume.assert_not_called()

    def test_changed_identity_refuses_start(self) -> None:
        instance = self.instance()
        changed = {**instance.original, "image": "sha256:" + "f" * 64}
        with patch.object(instance, "inspect", return_value=changed), patch.object(instance, "command") as command:
            with self.assertRaisesRegex(ValueError, "identity_changed"):
                instance.resume()
            command.assert_not_called()

    def test_other_database_client_refused(self) -> None:
        instance = self.instance()
        others = [{"service": name, "project": "fixture", "id": name, "image": name,
                   "running": True, "mounts": []} for name in ("postgres", "redis", "frontend")]
        with patch.object(instance, "containers", return_value=others), \
                patch.object(instance, "inspect", return_value=instance.pg), patch.object(instance, "sql", return_value=b"1"):
            with self.assertRaisesRegex(ValueError, "other_database_clients"):
                instance.writers(stopped=True)

    def test_unknown_startup_refused_before_stop(self) -> None:
        instance = self.instance()
        with patch.object(instance, "containers", return_value=[{**instance.original, "command": ["sh", "-c", "migrate"]}]), \
                patch.object(instance, "command") as command:
            with self.assertRaisesRegex(ValueError, "node_only"):
                instance.preflight()
            command.assert_not_called()

    def test_deploy_lock_overlap_refused_before_preflight(self) -> None:
        import fcntl
        instance = self.instance()
        with (self.root / "releases/.deploy.lock").open("w") as lock:
            os.chmod(lock.name, 0o600)
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with patch.object(instance, "preflight") as preflight:
                with self.assertRaises(BlockingIOError):
                    instance.capture()
                preflight.assert_not_called()

    def test_resume_failure_is_prominent_and_no_package(self) -> None:
        instance = self.instance()
        with patch.object(instance, "preflight"), patch.object(instance, "identity", return_value={"running": False}), \
                patch.object(instance, "writers", side_effect=[None, ValueError("writer")]), \
                patch.object(instance, "command"), patch.object(instance, "resume", side_effect=ValueError("start failed")):
            with self.assertRaisesRegex(ValueError, "BACKEND_RESUME_FAILED_OPERATOR_REQUIRED"):
                instance.capture()
        self.assertTrue((instance.destination / "resume-failed.json").exists())
        self.assertFalse((instance.destination / "manifest.json").exists())

    def test_identity_file_and_directory_synced_before_stop(self) -> None:
        instance = self.instance()
        events = []
        fsync = os.fsync
        def synced(fd):
            events.append("fsync")
            fsync(fd)
        def command(*args, **_kwargs):
            if args[0] == "stop":
                saved = json.loads((instance.destination / "pre-stop.json").read_text())
                self.assertEqual(saved["backend"], instance.recovery_identity())
                self.assertEqual(events, ["fsync", "fsync"])
                self.assertEqual((instance.destination / "pre-stop.json").stat().st_mode & 0o077, 0)
                events.append("stop")
                raise ValueError("synthetic stop failure")
            return b""
        with patch.object(instance, "preflight"), patch.object(instance, "identity"), \
                patch.object(instance, "writers"), patch.object(instance, "resume"), \
                patch.object(instance, "command", side_effect=command), patch.object(runtime.os, "fsync", side_effect=synced):
            with self.assertRaisesRegex(ValueError, "synthetic stop"):
                instance.capture()
        self.assertEqual(events, ["fsync", "fsync", "stop"])

    def test_failed_file_or_parent_fsync_never_stops_backend(self) -> None:
        for failed_sync in (1, 2):
            instance = self.instance() if failed_sync == 1 else instance
            if failed_sync == 2:
                (instance.destination / "pre-stop.json").unlink()
            calls = 0
            def synced(_fd):
                nonlocal calls
                calls += 1
                if calls == failed_sync:
                    raise OSError("synthetic fsync failure")
            with self.subTest(failed_sync=failed_sync), patch.object(instance, "preflight"), \
                    patch.object(instance, "identity"), patch.object(instance, "writers"), \
                    patch.object(runtime.os, "fsync", side_effect=synced), \
                    patch.object(instance, "command") as command, patch.object(instance, "resume") as resume:
                with self.assertRaises(OSError):
                    instance.capture()
                command.assert_not_called()
                resume.assert_not_called()
                self.assertFalse(instance.stopping)

    def test_uncertain_delayed_daemon_stop_must_settle_before_start_and_success(self) -> None:
        instance = self.instance()
        events = []
        state = {**instance.original, "running": True, "health": "healthy"}
        def identity(**_kwargs):
            events.append("healthy_inspection" if state["running"] else "stopped_inspection")
            return dict(state)
        def command(*args, **kwargs):
            events.append(args[0])
            self.assertEqual(kwargs["timeout"], 60)
            if args[0] == "stop":
                # The original daemon-side operation was still pending while
                # initial inspections looked healthy; the retry waits for completion.
                state["running"] = False
            elif args[0] == "start":
                self.assertFalse(state["running"])
                state["running"] = True
        with patch.object(instance, "identity", side_effect=identity), patch.object(instance, "command", side_effect=command):
            instance.resume()
        self.assertEqual(events, ["healthy_inspection", "stop", "stopped_inspection", "start", "healthy_inspection"])
        self.assertTrue(instance.stop_acknowledged)

    def test_timeout_and_signal_stop_failures_enter_settled_recovery(self) -> None:
        instance = self.instance()
        for error in (subprocess.TimeoutExpired("docker stop", 60), KeyboardInterrupt()):
            with self.subTest(error=type(error).__name__):
                instance.stopping, instance.stop_acknowledged = False, False
                for name in ("pre-stop.json", "resume.json"):
                    path = instance.destination / name
                    if path.exists():
                        path.unlink()
                state = {**instance.original, "running": True, "health": "healthy"}
                commands = []
                def command(*args, **_kwargs):
                    commands.append(args[0])
                    if args[0] == "stop":
                        if commands.count("stop") == 1:
                            raise error
                        state["running"] = False
                    elif args[0] == "start":
                        state["running"] = True
                    return b""
                with patch.object(instance, "preflight"), patch.object(instance, "writers"), \
                        patch.object(instance, "identity", side_effect=lambda **_kwargs: dict(state)), \
                        patch.object(instance, "command", side_effect=command):
                    with self.assertRaises(type(error)):
                        instance.capture()
                self.assertEqual(commands, ["stop", "stop", "start"])
                self.assertEqual(json.loads((instance.destination / "resume.json").read_text())["status"], "success")

    def test_unsettled_stop_refuses_false_healthy_success(self) -> None:
        instance = self.instance()
        with patch.object(instance, "identity", return_value={**instance.original, "running": True, "health": "healthy"}), \
                patch.object(instance, "command") as command:
            with self.assertRaisesRegex(ValueError, "backend_stop_not_settled"):
                instance.resume()
        command.assert_called_once_with("stop", "--time", "45", instance.original["id"], timeout=60)

    def test_all_recovery_commands_share_one_deadline_with_slow_inspections(self) -> None:
        instance = self.instance()
        clock = [0.0]
        calls = []
        def advance(name, cost, timeout):
            calls.append((name, clock[0], timeout))
            self.assertLessEqual(clock[0] + timeout, 290)
            if cost > timeout:
                clock[0] += timeout
                # Bounded runtime.run cleanup gets its own five seconds.
                clock[0] += 5
                raise subprocess.TimeoutExpired(name, timeout)
            clock[0] += cost
        def identity(*, timeout):
            advance("inspect", 119, timeout)
            return {**instance.original, "running": True, "health": "healthy"}
        def command(*args, timeout):
            advance(args[0], 59, timeout)
        with patch.object(capture.time, "monotonic", side_effect=lambda: clock[0]), \
                patch.object(instance, "identity", side_effect=identity), \
                patch.object(instance, "command", side_effect=command):
            with self.assertRaises(subprocess.TimeoutExpired):
                instance.resume()
        self.assertEqual([name for name, _, _ in calls], ["inspect", "stop", "inspect"])
        self.assertEqual(calls[-1][2], 112)
        self.assertEqual(clock[0], 295)
        self.assertLess(clock[0], 360)


if __name__ == "__main__":
    unittest.main()
