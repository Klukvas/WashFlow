"""Synthetic local monitoring checks; no application, DB, provider or user data."""

import argparse
import contextlib
import hashlib
import importlib.util
import io
import json
import socketserver
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
import unittest
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Iterator

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/operations/check.py"
SPEC = importlib.util.spec_from_file_location("operations_check", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
check = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(check)
NOW = datetime(2026, 10, 25, 12, tzinfo=timezone.utc)
HEALTH: dict[str, Any] = {"status": "ok", "details": {
    name: {"status": "up"} for name in check.COMPONENTS
}}


@contextlib.contextmanager
def server(payload: object, status: int = 200, delay: float = 0) -> Iterator[str]:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            time.sleep(delay)
            self.send_response(status)
            self.send_header("Location", "http://example.invalid/api/v1/health")
            self.end_headers()
            body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def log_message(self, *_args) -> None:
            pass

    service = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=service.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{service.server_port}/api/v1/health"
    finally:
        service.shutdown()
        service.server_close()
        thread.join(timeout=2)


class HealthTests(unittest.TestCase):
    def run_health(self, url: str, timeout: float = 1) -> tuple[dict, int]:
        return check.health(argparse.Namespace(url=url, timeout_seconds=timeout))

    def test_raw_and_actual_application_envelope(self) -> None:
        for payload in (HEALTH, {"data": HEALTH, "meta": {"timestamp": "synthetic"}}):
            with self.subTest(payload=payload), server(payload) as url:
                result, code = self.run_health(url)
                self.assertEqual(code, 0)
                self.assertTrue(result["ok"])

    def test_overall_and_each_dependency_are_required(self) -> None:
        cases = [{**HEALTH, "status": "error"}, {"status": "ok"}]
        cases += [{**HEALTH, "details": {
            **HEALTH["details"], name: {"status": "down", "message": "PRIVATE"}
        }} for name in check.COMPONENTS]
        cases += [{**HEALTH, "details": {
            key: value for key, value in HEALTH["details"].items() if key != name
        }} for name in check.COMPONENTS]
        for payload in cases:
            with self.subTest(payload=payload), server(payload) as url:
                result, code = self.run_health(url)
                self.assertEqual(code, 1)
                self.assertNotIn("PRIVATE", json.dumps(result))

    def test_http_errors_redirects_and_invalid_json(self) -> None:
        for status, payload in ((503, b"PRIVATE"), (302, HEALTH), (200, b"not-json"),
                                (200, []), (200, b"x" * 65537)):
            with self.subTest(status=status), server(payload, status) as url:
                result, code = self.run_health(url)
                self.assertEqual(code, 1)
                self.assertNotIn("PRIVATE", json.dumps(result))

    def test_timeout_and_connection_refused(self) -> None:
        with server(HEALTH, delay=0.15) as url:
            result, code = self.run_health(url, timeout=0.02)
            self.assertEqual((code, result["issues"]), (1, ["request_failed"]))
        self.assertEqual(self.run_health(url)[1], 1)

    def test_url_and_timeout_validation_before_request(self) -> None:
        invalid = ["https://127.0.0.1:123/", "http://localhost:123/api/v1/health",
                   "http://example.com:123/api/v1/health",
                   "http://user:PRIVATE@127.0.0.1:123/api/v1/health",
                   "http://127.0.0.1:123/api/v1/health?token=PRIVATE",
                   "http://127.0.0.1/api/v1/health"]
        for url in invalid:
            with self.subTest(url=url), self.assertRaises(check.InputError):
                self.run_health(url)
        for timeout in (0, -1, float("nan"), float("inf"), 61):
            with self.subTest(timeout=timeout), self.assertRaises(check.InputError):
                self.run_health("http://127.0.0.1:123/api/v1/health", timeout)


class BackupTests(unittest.TestCase):
    def setUp(self) -> None:
        temporary = tempfile.TemporaryDirectory(prefix="fixture-", dir=Path(__file__).parent)
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.attempts = self.root / "attempts"
        self.bundles = self.root / "bundles"
        self.attempts.mkdir()
        self.bundles.mkdir()
        self.args = argparse.Namespace(attempts=str(self.attempts), bundles=str(self.bundles),
                                       max_age_seconds=21600, grace_seconds=600,
                                       running_timeout_seconds=7200)

    def attempt(self, name: str, status: str, age: int = 60) -> Path:
        bundle = self.bundles / name
        bundle.mkdir()
        created = NOW - timedelta(seconds=age)
        if status == "success":
            (bundle / "database.dump").write_bytes(b"PGDMPsynthetic")
            with tarfile.open(bundle / "uploads.tar.gz", "w:gz") as archive:
                member = tarfile.TarInfo("synthetic-photo")
                member.size = 7
                archive.addfile(member, io.BytesIO(b"fixture"))
            metadata = {
                "format": "washflow-local-v1", "postgres_major": 16,
                "created_at": created.isoformat(), "source_database": "synthetic",
                "consistency": "operator-confirmed-quiesced",
                "files": {file: {"bytes": (bundle / file).stat().st_size,
                                  "sha256": hashlib.sha256(
                                      (bundle / file).read_bytes()).hexdigest()}
                          for file in ("database.dump", "uploads.tar.gz")},
            }
            (bundle / "manifest.json").write_text(json.dumps(metadata))
        record = {"format": "washflow-backup-attempt-v1", "status": status,
                  "started_at": (created - timedelta(seconds=10)).isoformat(),
                  "updated_at": created.isoformat(), "bundle": str(bundle)}
        path = self.attempts / f"{name}.json"
        path.write_text(json.dumps(record))
        return path

    def run_backup(self) -> tuple[dict, int]:
        return check.backup(self.args, now=NOW)

    def test_empty_directory_does_not_establish_success(self) -> None:
        result, code = self.run_backup()
        self.assertEqual(code, 1)
        self.assertEqual(result["issues"], ["no_fresh_verified_backup"])

    def test_verified_success_and_newer_failure_preserves_timestamp(self) -> None:
        self.attempt("good", "success", 600)
        before, code = self.run_backup()
        self.assertEqual(code, 0)
        self.attempt("failed", "failed", 20)
        result, code = self.run_backup()
        self.assertEqual(code, 1)
        self.assertIn("latest_attempt_failed", result["issues"])
        self.assertEqual(result["last_verified_success_at"], before["last_verified_success_at"])
        self.assertEqual(result["verified_successes"], 1)
        self.assertNotIn(str(self.root), json.dumps(result))

    def test_recovery_supersedes_historical_failed_attempt(self) -> None:
        self.attempt("failed", "failed", 600)
        self.attempt("recovered", "success", 20)
        self.assertEqual(self.run_backup()[1], 0)

    def test_running_retry_preserves_failure_until_verified_success(self) -> None:
        self.attempt("good", "success", 600)
        self.attempt("failed", "failed", 60)
        before, code = self.run_backup()
        self.assertEqual(code, 1)
        self.attempt("retry", "running", 20)
        retry, code = self.run_backup()
        self.assertEqual(code, 1)
        self.assertIn("latest_attempt_failed", retry["issues"])
        self.assertEqual(retry["latest_attempt_status"], "running")
        self.assertEqual(retry["last_verified_success_at"], before["last_verified_success_at"])
        self.assertEqual(retry["verified_successes"], 1)
        self.attempt("recovered", "success", 5)
        self.assertEqual(self.run_backup()[1], 0)

    def test_unverified_success_cannot_resolve_failure(self) -> None:
        self.attempt("good", "success", 600)
        self.attempt("failed", "failed", 60)
        self.attempt("corrupt", "success", 20)
        (self.bundles / "corrupt/database.dump").write_bytes(b"corrupt")
        result, code = self.run_backup()
        self.assertEqual(code, 1)
        self.assertIn("latest_attempt_failed", result["issues"])
        self.assertIn("invalid_success_bundle", result["issues"])

    def test_fresh_running_differs_from_stale_running(self) -> None:
        self.attempt("good", "success")
        path = self.attempt("running", "running", 20)
        self.assertEqual(self.run_backup()[1], 0)
        record = json.loads(path.read_text())
        record["started_at"] = (NOW - timedelta(seconds=7201)).isoformat()
        path.write_text(json.dumps(record))
        self.assertIn("stale_running_attempt", self.run_backup()[0]["issues"])

    def test_staleness_includes_explicit_grace_and_manifest_time(self) -> None:
        self.attempt("boundary", "success", 22200)
        self.assertEqual(self.run_backup()[1], 0)
        self.args.grace_seconds = 599
        self.assertIn("no_fresh_verified_backup", self.run_backup()[0]["issues"])

    def test_malformed_symlink_future_and_outside_records(self) -> None:
        self.attempt("good", "success")
        for mutation in ("json", "symlink", "future", "outside", "naive", "format"):
            with self.subTest(mutation=mutation):
                path = self.attempt(mutation, "running", 20)
                record = json.loads(path.read_text())
                if mutation == "json":
                    path.write_text("{")
                elif mutation == "symlink":
                    path.unlink()
                    path.symlink_to(self.attempts / "good.json")
                else:
                    field, value = {
                        "future": ("updated_at", (NOW + timedelta(seconds=1)).isoformat()),
                        "outside": ("bundle", str(self.root)),
                        "naive": ("started_at", "2026-10-25T00:00:00"),
                        "format": ("format", "unknown"),
                    }[mutation]
                    path.write_text(json.dumps({**record, field: value}))
                self.assertIn("malformed_attempt", self.run_backup()[0]["issues"])

    def test_success_requires_manifest_and_intact_payloads(self) -> None:
        self.attempt("good", "success")
        for filename in ("manifest.json", "database.dump", "uploads.tar.gz"):
            path = self.bundles / "good" / filename
            original = path.read_bytes()
            path.write_bytes(b"corrupt")
            result, code = self.run_backup()
            self.assertEqual(code, 1)
            self.assertEqual(result["verified_successes"], 0)
            self.assertIn("invalid_success_bundle", result["issues"])
            path.write_bytes(original)

    def test_read_only_and_invalid_roots(self) -> None:
        self.attempt("good", "success")
        before = {path: path.read_bytes() for path in self.root.rglob("*") if path.is_file()}
        self.assertEqual(self.run_backup()[1], 0)
        after = {path: path.read_bytes() for path in self.root.rglob("*") if path.is_file()}
        self.assertEqual(before, after)
        self.args.attempts = str(self.root / "missing")
        with self.assertRaises(check.InputError):
            self.run_backup()


class CliTests(unittest.TestCase):
    def test_malformed_wire_responses_are_redacted_json(self) -> None:
        responses = [b"PRIVATE malformed status\r\n\r\n",
                     b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n"
                     b"30\r\nPRIVATE truncated body"]
        for response in responses:
            class Handler(socketserver.BaseRequestHandler):
                def handle(self) -> None:
                    self.request.recv(65536)
                    self.request.sendall(response)

            with self.subTest(response=response), socketserver.TCPServer(
                    ("127.0.0.1", 0), Handler) as service:
                thread = threading.Thread(target=service.serve_forever, daemon=True)
                thread.start()
                try:
                    url = f"http://127.0.0.1:{service.server_address[1]}/api/v1/health"
                    result = subprocess.run(
                        [sys.executable, "-B", str(SCRIPT), "health", "--url", url],
                        capture_output=True, text=True, check=False, timeout=5,
                    )
                    self.assertEqual(result.returncode, 1)
                    self.assertEqual(json.loads(result.stdout)["issues"], ["request_failed"])
                    self.assertEqual(result.stderr, "")
                    self.assertNotIn("PRIVATE", result.stdout)
                finally:
                    service.shutdown()
                    thread.join(timeout=2)

    def test_errors_are_json_only_and_redact_arguments(self) -> None:
        cases = [[], ["health", "--url", "PRIVATE"],
                 ["health", "--url", "PRIVATE", "--timeout-seconds", "PRIVATE"],
                 ["PRIVATE"], ["backup", "--attempts", "PRIVATE"]]
        for arguments in cases:
            with self.subTest(arguments=arguments):
                result = subprocess.run([sys.executable, "-B", str(SCRIPT), *arguments],
                                        capture_output=True, text=True, check=False, timeout=5)
                self.assertEqual(result.returncode, 2)
                self.assertFalse(json.loads(result.stdout)["ok"])
                self.assertEqual(result.stderr, "")
                self.assertNotIn("PRIVATE", result.stdout)


if __name__ == "__main__":
    unittest.main()
