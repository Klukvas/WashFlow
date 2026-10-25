#!/usr/bin/env python3
"""Read-only local health and verified-backup checks; one JSON result on stdout."""

import argparse
import http.client
import importlib.util
import json
import math
import tarfile
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, NoReturn

COMPONENTS = ("database", "redis", "queues")
MAX_JSON_BYTES = 65536


class InputError(ValueError):
    """An invalid operator argument, safe to summarize without its value."""


class JsonParser(argparse.ArgumentParser):
    def error(self, message: str) -> NoReturn:
        raise InputError("invalid_arguments")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def timestamp(value: object) -> datetime:
    if not isinstance(value, str):
        raise ValueError("timestamp")
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        raise ValueError("timezone")
    return parsed.astimezone(timezone.utc)


def bounded_json(path: Path) -> dict:
    if path.is_symlink() or not path.is_file():
        raise ValueError("not_regular")
    with path.open("rb") as stream:
        payload = stream.read(MAX_JSON_BYTES + 1)
    if len(payload) > MAX_JSON_BYTES:
        raise ValueError("too_large")
    data = json.loads(payload)
    if not isinstance(data, dict):
        raise ValueError("not_object")
    return data


def positive(value: float) -> float:
    if not math.isfinite(value) or value <= 0:
        raise InputError("invalid_interval")
    return value


def health_url(value: str) -> str:
    try:
        url = urllib.parse.urlsplit(value)
        valid = (
            url.scheme == "http" and url.hostname in ("127.0.0.1", "::1")
            and url.port is not None and 1 <= url.port <= 65535
            and url.username is None and url.password is None
            and url.path == "/api/v1/health" and not url.query and not url.fragment
        )
    except ValueError:
        valid = False
    if not valid:
        raise InputError("invalid_local_health_url")
    return value


def health(args: argparse.Namespace) -> tuple[dict, int]:
    url = health_url(args.url)
    timeout = positive(args.timeout_seconds)
    if timeout > 60:
        raise InputError("timeout_exceeds_60_seconds")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(url, timeout=timeout) as response:
            status = response.status
            payload = response.read(MAX_JSON_BYTES + 1)
    except urllib.error.HTTPError as error:
        error.close()
        return {"check": "health", "ok": False, "http_status": error.code,
                "issues": ["http_status"]}, 1
    except (urllib.error.URLError, http.client.HTTPException, TimeoutError, OSError, ValueError):
        return {"check": "health", "ok": False, "issues": ["request_failed"]}, 1
    if len(payload) > MAX_JSON_BYTES:
        return {"check": "health", "ok": False, "issues": ["response_too_large"]}, 1
    try:
        document = json.loads(payload)
        # The global TransformInterceptor wraps successful Terminus responses in data.
        data = document.get("data", document) if isinstance(document, dict) else None
        details = data.get("details") if isinstance(data, dict) else None
        if not isinstance(data, dict) or not isinstance(details, dict):
            raise ValueError("missing_details")
        components = {
            name: "up" if isinstance(details.get(name), dict)
            and details[name].get("status") == "up" else "down"
            for name in COMPONENTS
        }
        issues = ([] if status == 200 else ["http_status"]) + (
            [] if data.get("status") == "ok" else ["overall_status"]
        ) + [f"{name}_down" for name, state in components.items() if state != "up"]
        return {"check": "health", "ok": not issues, "http_status": status,
                "components": components, "issues": issues}, int(bool(issues))
    except (ValueError, TypeError, UnicodeError, RecursionError):
        return {"check": "health", "ok": False, "http_status": status,
                "issues": ["invalid_health_payload"]}, 1


def verifier() -> Callable[[Path], dict]:
    path = Path(__file__).resolve().parents[1] / "backup/backup.py"
    spec = importlib.util.spec_from_file_location("washflow_backup_verify", path)
    if spec is None or spec.loader is None:
        raise ImportError("backup_verifier_unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.verify


def read_attempt(path: Path, now: datetime, bundles: Path) -> dict:
    record = bounded_json(path)
    if (record.get("format") != "washflow-backup-attempt-v1"
            or record.get("status") not in ("running", "failed", "success")):
        raise ValueError("attempt_schema")
    started = timestamp(record.get("started_at"))
    updated = timestamp(record.get("updated_at"))
    if not started <= updated <= now:
        raise ValueError("attempt_time")
    value = record.get("bundle")
    if not isinstance(value, str) or not Path(value).is_absolute():
        raise ValueError("bundle_path")
    bundle = Path(value)
    if bundle.is_symlink() or not bundle.resolve().is_relative_to(bundles):
        raise ValueError("bundle_boundary")
    return {"status": record["status"], "started": started, "updated": updated,
            "bundle": bundle}


def backup(args: argparse.Namespace, now: datetime | None = None) -> tuple[dict, int]:
    current = now or datetime.now(timezone.utc)
    max_age = positive(args.max_age_seconds)
    running_limit = positive(args.running_timeout_seconds)
    if not math.isfinite(args.grace_seconds) or args.grace_seconds < 0:
        raise InputError("invalid_grace")
    roots = [Path(args.attempts), Path(args.bundles)]
    if any(path.is_symlink() or not path.is_dir() for path in roots):
        raise InputError("invalid_roots")
    attempts, bundles = (path.resolve() for path in roots)
    verify = verifier()
    records, successes, verified_completions, issues = [], [], [], []
    for path in sorted(attempts.glob("*.json")):
        try:
            record = read_attempt(path, current, bundles)
            records.append(record)
            if record["status"] == "running":
                if (current - record["started"]).total_seconds() > running_limit:
                    issues.append("stale_running_attempt")
            elif record["status"] == "success":
                try:
                    metadata = verify(record["bundle"])
                    created = timestamp(metadata["created_at"])
                    if not record["started"] <= created <= record["updated"]:
                        raise ValueError("manifest_time")
                    successes.append(created)
                    verified_completions.append(record["updated"])
                except (ValueError, TypeError, KeyError, OSError, EOFError,
                        tarfile.TarError, RecursionError):
                    issues.append("invalid_success_bundle")
        except (ValueError, TypeError, OSError, OverflowError, RecursionError):
            issues.append("malformed_attempt")
    latest = max(records, key=lambda item: item["started"]) if records else None
    failures = [record["updated"] for record in records if record["status"] == "failed"]
    if failures and (not verified_completions or max(failures) >= max(verified_completions)):
        issues.append("latest_attempt_failed")
    last_success = max(successes) if successes else None
    age = (current - last_success).total_seconds() if last_success else None
    if age is None or age > max_age + args.grace_seconds:
        issues.append("no_fresh_verified_backup")
    result = {
        "check": "backup", "ok": not issues, "issues": sorted(set(issues)),
        "attempts": len(records), "verified_successes": len(successes),
        "latest_attempt_status": latest["status"] if latest else None,
        "last_verified_success_at": last_success.isoformat() if last_success else None,
        "success_age_seconds": round(age, 3) if age is not None else None,
        "freshness_limit_seconds": max_age + args.grace_seconds,
    }
    return result, int(bool(issues))


def main(argv: list[str] | None = None) -> int:
    parser = JsonParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    health_parser = commands.add_parser("health")
    health_parser.add_argument("--url", required=True)
    health_parser.add_argument("--timeout-seconds", type=float, default=5)
    backup_parser = commands.add_parser("backup")
    backup_parser.add_argument("--attempts", required=True)
    backup_parser.add_argument("--bundles", required=True)
    backup_parser.add_argument("--max-age-seconds", type=float, required=True)
    backup_parser.add_argument("--grace-seconds", type=float, default=0)
    backup_parser.add_argument("--running-timeout-seconds", type=float, default=7200)
    try:
        args = parser.parse_args(argv)
        result, code = health(args) if args.command == "health" else backup(args)
    except InputError as error:
        result, code = {"check": "input", "ok": False, "issues": [str(error)]}, 2
    except (OSError, ValueError, TypeError, ImportError, AttributeError, RecursionError):
        result, code = {"check": "checker", "ok": False,
                        "issues": ["check_could_not_complete"]}, 2
    print(json.dumps(result, sort_keys=True, allow_nan=False))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
