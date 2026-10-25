"""Non-DB safety regressions; all fixtures are owned temporary files in this tree."""

import argparse
import importlib.util
import io
import json
import os
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("backup", ROOT / "scripts/backup/backup.py")
backup = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(backup)


class BackupSafetyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="fixture-", dir=Path(__file__).parent)
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.bundle = self.root / "bundle"
        self.bundle.mkdir()
        (self.bundle / "database.dump").write_bytes(b"PGDMPsynthetic-test")
        self.write_archive("vehicles/photo.txt", b"synthetic photo")

    def write_archive(self, name: str, payload: bytes, kind: bytes = tarfile.REGTYPE) -> None:
        with tarfile.open(self.bundle / "uploads.tar.gz", "w:gz") as archive:
            entry = tarfile.TarInfo(name)
            entry.type = kind
            entry.linkname = "../../outside"
            entry.size = len(payload) if kind == tarfile.REGTYPE else 0
            archive.addfile(entry, io.BytesIO(payload) if kind == tarfile.REGTYPE else None)
        metadata = {
            "format": "washflow-local-v1", "postgres_major": 16,
            "created_at": "2026-10-25T00:00:00+00:00",
            "consistency": "operator-confirmed-quiesced", "source_database": "source",
            "files": {name: {"bytes": (self.bundle / name).stat().st_size,
                             "sha256": backup.digest(self.bundle / name)} for name in backup.FILES},
        }
        (self.bundle / "manifest.json").write_text(json.dumps(metadata))

    def args(self, **changes) -> argparse.Namespace:
        return argparse.Namespace(**{
            "bundle": str(self.bundle), "host": "127.0.0.1", "port": 5432,
            "user": "postgres", "database": "washflow_restore_test",
            "uploads": str(self.root / "restored"), "pg_bin": None, "passfile": None,
            "timeout_seconds": 30,
            "approve_target": "127.0.0.1:5432/washflow_restore_test", **changes,
        })

    def test_valid_bundle_verifies_and_extracts_files(self) -> None:
        backup.verify(self.bundle)
        target = backup.new_directory(self.root / "output")
        backup.extract_uploads(self.bundle, target)
        self.assertEqual((target / "vehicles/photo.txt").read_bytes(), b"synthetic photo")

    def test_corrupt_payloads_fail_before_any_connection_or_target_write(self) -> None:
        for name in backup.FILES:
            with self.subTest(name=name):
                self.write_archive("photo", b"fixture")
                path = self.bundle / name
                original = path.read_bytes()
                path.write_bytes(original + b"corruption")
                with patch.object(backup, "check_connection") as connect:
                    with self.assertRaisesRegex(ValueError, "checksum"):
                        backup.restore(self.args())
                    connect.assert_not_called()
                self.assertFalse((self.root / "restored").exists())
                path.write_bytes(original)

    def test_unsafe_archives_fail_even_with_matching_checksum(self) -> None:
        cases = [("../escape", tarfile.REGTYPE), ("/escape", tarfile.REGTYPE),
                 ("a/../../escape", tarfile.REGTYPE), ("a\\escape", tarfile.REGTYPE),
                 ("link", tarfile.SYMTYPE), ("hardlink", tarfile.LNKTYPE),
                 ("pipe", tarfile.FIFOTYPE)]
        for name, kind in cases:
            with self.subTest(name=name, kind=kind):
                self.write_archive(name, b"fixture", kind)
                with self.assertRaisesRegex(ValueError, "Unsafe"):
                    backup.verify(self.bundle)

    def test_unapproved_or_source_target_fails_before_connection(self) -> None:
        for changes in ({"approve_target": "wrong"},
                        {"database": "source", "approve_target": "127.0.0.1:5432/source"},
                        {"database": "postgres", "approve_target": "127.0.0.1:5432/postgres"}):
            with self.subTest(changes=changes), patch.object(backup, "check_connection") as connect:
                with self.assertRaises(ValueError):
                    backup.restore(self.args(**changes))
                connect.assert_not_called()

    def test_existing_empty_nonempty_and_symlink_upload_targets_are_preserved(self) -> None:
        empty = self.root / "empty"
        empty.mkdir()
        occupied = self.root / "occupied"
        occupied.mkdir()
        sentinel = occupied / "sentinel"
        sentinel.write_text("preserve")
        link = self.root / "link"
        link.symlink_to(occupied)
        for target in (empty, occupied, link):
            with self.subTest(target=target), patch.object(backup, "check_connection") as connect:
                with self.assertRaisesRegex(ValueError, "must not exist"):
                    backup.restore(self.args(uploads=str(target)))
                connect.assert_not_called()
        self.assertEqual(sentinel.read_text(), "preserve")

    def test_existing_database_is_refused_without_creating_uploads(self) -> None:
        with patch.object(backup, "check_connection"), patch.object(backup, "pg", return_value=b"1\n"):
            with self.assertRaisesRegex(ValueError, "already exists"):
                backup.restore(self.args())
        self.assertFalse((self.root / "restored").exists())

    def test_connection_rejects_remote_hosts_and_conninfo_injection(self) -> None:
        for changes in ({"host": "example.com"}, {"host": "localhost"},
                        {"database": "postgresql://evil/db"}, {"user": "-option"},
                        {"port": 0}, {"database": "x'; DROP DATABASE postgres;--"}):
            with self.subTest(changes=changes), patch.object(backup, "pg") as run:
                with self.assertRaises(ValueError):
                    backup.check_connection(self.args(**changes))
                run.assert_not_called()

    def test_pg_environment_ignores_inherited_database_settings(self) -> None:
        with patch.dict(os.environ, {"PGHOST": "evil", "PGOPTIONS": "bad", "PGSERVICE": "real",
                                     "PGPASSWORD": "synthetic", "DATABASE_URL": "synthetic"}):
            environment = backup.pg_environment(None)
        self.assertFalse(set(environment) & {"PGHOST", "PGOPTIONS", "PGSERVICE", "PGPASSWORD", "DATABASE_URL"})
        self.assertEqual(environment["PGPASSFILE"], os.devnull)

    def test_attempt_records_success_failure_and_never_overwrites_existing(self) -> None:
        for succeeds in (True, False):
            record = self.root / f"record-{succeeds}.json"
            args = self.args(record=str(record), command="backup")
            with patch.object(backup, "execute", side_effect=None if succeeds else ValueError("fixture")):
                if succeeds:
                    backup.record_attempt(args)
                else:
                    with self.assertRaises(ValueError):
                        backup.record_attempt(args)
            status = json.loads(record.read_text())
            self.assertEqual(status["status"], "success" if succeeds else "failed")
            self.assertIn("started_at", status)
            original = record.read_bytes()
            with self.assertRaises(FileExistsError):
                backup.record_attempt(args)
            self.assertEqual(record.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
