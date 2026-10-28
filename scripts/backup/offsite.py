"""Explicit S3-compatible destination; encrypt first, read back before success."""
import argparse
import json
import logging
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
from urllib.parse import urlparse
import uuid

import backup
from runtime import binary, digest, fresh, private, record, require, run

MEMBERS = ("database.dump", "uploads.tar.gz", "manifest.json")


def gpg(home: Path, *options: str) -> list[str]:
    private(home, directory=True)
    gpg_bin = binary("gpg")
    version = run([gpg_bin, "--no-options", "--version"])
    match = re.search(rb"gpg \(GnuPG\) (\d+)\.(\d+)\.(\d+)", version)
    require(match is not None and tuple(map(int, match.groups())) >= (2, 2, 8), "gpg_2_2_8_required")
    return [gpg_bin, "--no-options", "--homedir", str(home), "--batch", "--no-tty",
            "--no-auto-key-retrieve", "--auto-key-locate", "clear", *options]


def encrypt(bundle: Path, target: Path, home: Path, fingerprint: str) -> None:
    require(bool(re.fullmatch(r"(?:[A-F0-9]{40}|[A-F0-9]{64})", fingerprint)), "full_recipient_fingerprint_required")
    backup.verify(bundle)
    secret_directory = home / "private-keys-v1.d"
    require(not secret_directory.exists() or not any(secret_directory.iterdir()),
            "source_keyring_must_be_public_only")
    listing = run(gpg(home, "--with-colons", "--fingerprint", "--list-keys", fingerprint))
    fingerprints = [line.split(b":")[9].decode() for line in listing.splitlines() if line.startswith(b"fpr:")]
    require(fingerprint in fingerprints, "recipient_key_not_pinned")
    plain = target.parent / "bundle.tar"
    # Plaintext must be 0600 regardless of the caller's umask (defence on direct calls).
    descriptor = os.open(plain, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "wb") as stream:
        with tarfile.open(fileobj=stream, mode="w") as archive:
            for name in MEMBERS:
                archive.add(bundle / name, arcname=name, recursive=False)
    # Modern GnuPG requires MDC on legacy OpenPGP encryption (or uses AEAD).
    # No ignore-MDC, RFC2440, unsafe config or implicit key retrieval is permitted.
    run(gpg(home, "--trust-model", "always", "--cipher-algo", "AES256", "--compress-algo", "none",
            "--recipient", fingerprint, "--output", str(target), "--encrypt", str(plain)), timeout=1800)
    require(target.is_file() and target.stat().st_size > 0, "missing_ciphertext")


class Storage:
    def __init__(self, endpoint: str, bucket: str, profile: str, prefix: str) -> None:
        parsed = urlparse(endpoint)
        require(parsed.scheme == "https" and bool(parsed.hostname) and parsed.username is None
                and parsed.password is None and not parsed.query and not parsed.fragment
                and parsed.path in ("", "/"), "explicit_https_endpoint_required")
        require(bool(re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", bucket)), "invalid_bucket")
        require(bool(re.fullmatch(r"[A-Za-z0-9_-]{1,80}", profile)), "explicit_profile_required")
        require(bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9/_-]{0,180}", prefix))
                and all(part not in ("", ".", "..") for part in prefix.split("/")), "invalid_object_prefix")
        self.endpoint, self.bucket, self.profile, self.prefix = endpoint, bucket, profile, prefix

    def aws(self, *options: str) -> bytes:
        # Never inherit implicit environment/web-identity/container/instance credentials,
        # endpoints, disabled TLS or user-config retries. Explicit named profile only.
        env = {key: value for key, value in os.environ.items()
               if not key.startswith("AWS_") and key not in ("BOTO_CONFIG", "REQUESTS_CA_BUNDLE")}
        env.update(AWS_EC2_METADATA_DISABLED="true", AWS_MAX_ATTEMPTS="3", AWS_RETRY_MODE="standard",
                   AWS_PAGER="", AWS_CLI_AUTO_PROMPT="off")
        return run([binary("aws"), "--profile", self.profile, "--endpoint-url", self.endpoint,
                    "--cli-connect-timeout", "10", "--cli-read-timeout", "60", "--no-cli-pager",
                    "s3api", *options], timeout=1800, env=env)

    def put(self, key: str, path: Path) -> None:
        self.validate_key(key)
        self.aws("put-object", "--bucket", self.bucket, "--key", key, "--body", str(path),
                 "--if-none-match", "*", "--checksum-algorithm", "SHA256")

    def validate_key(self, key: str) -> None:
        require(bool(re.fullmatch(re.escape(self.prefix) + r"/[0-9a-f]{32}\.tar\.gpg", key)),
                "object_key_outside_approved_prefix")

    def get(self, key: str, target: Path) -> None:
        self.validate_key(key)
        # Atomically create the output so a later aws write cannot be redirected
        # through a swapped symlink; O_NOFOLLOW+O_EXCL reject both.
        descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        os.close(descriptor)
        self.aws("get-object", "--bucket", self.bucket, "--key", key, str(target))


def publish(bundle: Path, work: Path, home: Path, fingerprint: str, storage: Storage) -> dict:
    private(work, directory=True)
    ciphertext = work / "bundle.tar.gpg"
    encrypt(bundle, ciphertext, home, fingerprint)
    checksum = digest(ciphertext)
    key = storage.prefix + "/" + uuid.uuid4().hex + ".tar.gpg"
    record(work / "transfer-started.json", {"status": "running", "key": key, "sha256": checksum})
    try:
        storage.put(key, ciphertext)
        downloaded = work / "readback.tar.gpg"
        storage.get(key, downloaded)
        require(digest(downloaded) == checksum, "offsite_readback_checksum_mismatch")
    except BaseException:
        record(work / "transfer-failed.json", {"status": "failed", "key": key})
        raise
    receipt = {"format": "washflow-offsite-v1", "status": "success", "endpoint": storage.endpoint,
               "bucket": storage.bucket, "key": key, "sha256": checksum,
               "recipient_fingerprint": fingerprint, "bytes": ciphertext.stat().st_size}
    record(work / "receipt.json", receipt)
    return receipt


def decrypt(downloaded: Path, destination: Path, home: Path) -> Path:
    private(destination, directory=True)
    plain = destination / "decrypted.tar"
    status = run(gpg(home, "--status-fd", "1", "--output", str(plain), "--decrypt", str(downloaded)), timeout=1800)
    require(b"[GNUPG:] DECRYPTION_OKAY" in status, "decryption_not_verified")
    bundle = fresh(destination, "bundle")
    with tarfile.open(plain, "r:") as archive:
        members = archive.getmembers()
        require(len(members) == len(MEMBERS) and {entry.name for entry in members} == set(MEMBERS)
                and all(entry.isfile() for entry in members), "unsafe_encrypted_bundle")
        for entry in members:
            source = archive.extractfile(entry)
            require(source is not None, "missing_encrypted_payload")
            with source, (bundle / entry.name).open("xb") as output:
                shutil.copyfileobj(source, output)
    backup.verify(bundle)
    return bundle


def download_verified(storage: Storage, key: str, checksum: str, work: Path, home: Path) -> Path:
    require(bool(re.fullmatch(r"[0-9a-f]{64}", checksum)), "independently_pinned_checksum_required")
    private(work, directory=True)
    ciphertext = work / "download.tar.gpg"
    storage.get(key, ciphertext)
    require(digest(ciphertext) == checksum, "download_checksum_mismatch")
    return decrypt(ciphertext, work, home)


def main() -> None:
    os.umask(0o077)
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("publish", "download"))
    for option in ("endpoint", "bucket", "profile", "prefix", "work", "gpg-home"):
        parser.add_argument("--" + option, required=True)
    parser.add_argument("--bundle")
    parser.add_argument("--recipient")
    parser.add_argument("--key")
    parser.add_argument("--sha256")
    args = parser.parse_args()
    try:
        storage = Storage(args.endpoint, args.bucket, args.profile, args.prefix)
        if args.command == "publish":
            require(bool(args.bundle and args.recipient), "bundle_and_recipient_required")
            publish(Path(args.bundle), Path(args.work), Path(args.gpg_home), args.recipient, storage)
        else:
            require(bool(args.key and args.sha256), "key_and_checksum_required")
            download_verified(storage, args.key, args.sha256, Path(args.work), Path(args.gpg_home))
        logging.info("OFFSITE %s OK", args.command)
    except (ValueError, OSError, tarfile.TarError, subprocess.SubprocessError) as error:
        logging.error("OFFSITE FAILED (%s); inspect private task records", type(error).__name__)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
