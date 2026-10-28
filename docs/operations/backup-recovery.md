# Backup and recovery

Status: **local implementation only; not activated or used in production.** Local capture,
GPG encryption, explicit S3-compatible transport and downloaded-copy isolated PostgreSQL 16
recovery tooling are available. The synthetic drill uses a filesystem object-store fixture;
it does not prove a real offserver upload. No job, storage account, credentials or live schedule
is configured here. This is a logical backup, not PITR.

## Recovery objectives and responsibilities

Before activation, the service owner must choose and record an RPO (maximum acceptable data
loss), RTO (maximum acceptable outage), maintenance window, backup operator and incident owner.
One proposed starting point is a backup every six hours, RPO six hours and RTO one hour.
These are **proposals**, not achieved production guarantees: a failed/stale backup increases
actual data loss, and real data size, transfer speed and verification determine restore time.
Measure a production-sized isolated drill before accepting an RTO. Logical backups have no
continuous WAL archive; smaller RPOs may require a separately designed PostgreSQL PITR service.

Capture PostgreSQL **and** vehicle photos from `uploads_data` (`/app/uploads` in production).
An online `pg_dump` is internally consistent for the database, but unrelated uploads copies
are not a transactionally consistent pair. For these tools, block ingress and webhooks, stop
the backend (HTTP, cron and BullMQ workers share one process), stop any other DB/upload writers,
wait for in-flight transactions/writes to finish, and keep them stopped throughout both copies.
Record the maintenance interval and exact deployed image/migration revision in the operator's
incident log. `--confirm-quiesced` is an operator attestation, **not an automatic lock or stop**.
Never pass it to an uncoordinated live snapshot. Resume the original stack after the attempt,
including failure, using an operator-approved maintenance wrapper.

## Local backup and integrity checks

Prerequisites: Python **3.11+**, matching PostgreSQL **16** `pg_dump`, `pg_restore` and `psql`,
filesystem capacity for the dump/uploads/restore, and an explicit libpq password file when
authentication is needed. No Python dependency install is required. Installed PostgreSQL 18
clients are deliberately rejected: the archive must also restore with PostgreSQL 16 tools.

The CLI accepts only literal loopback hosts (`127.0.0.1`, `::1`) and explicit port/user/database.
It never imports `.env`, uses `DATABASE_URL`, inherits `PG*` connection settings, or falls back
to `~/.pgpass`. Pass `--passfile /PRIVATE/approved.pgpass` explicitly; protect that existing file
with mode 0600. Do not put passwords in arguments or copy/print `.env`. The backup role needs
read access to all application objects and CONNECT to `postgres`; restore needs CREATEDB.
Global roles, tablespaces and cluster configuration are not included. Owners/ACLs are omitted;
the operator must provision/review least-privilege runtime roles separately before cutover.

Production Compose does **not** publish PostgreSQL. Do not open a public database port for
this tool. An operator can arrange an approved loopback-only tunnel to the private database
and a read-only local mount/copy of the quiesced uploads volume, or run Python and matching
clients in an approved maintenance environment with both resources available. A tunnel and
uploads access are prerequisites, not actions performed by these scripts. Their authorization
and paths must be reviewed before any production command. The source uploads directory must
exist, contain only regular files/directories, and remain unchanged during backup.

Example command shape, **after** those prerequisites and quiescence are satisfied; replace
`/APPROVED` and `/PRIVATE` with operator-owned paths. Bundle and attempt record must be new;
their parent directories must already exist. Store them outside uploads.

```bash
python3 -B scripts/backup/backup.py backup \
  --host 127.0.0.1 --port 15434 --user backup_reader --database washflow \
  --pg-bin /APPROVED/postgresql16/bin --passfile /PRIVATE/approved.pgpass \
  --uploads /APPROVED/quiesced-uploads --bundle /APPROVED/backups/unique-bundle \
  --record /APPROVED/attempts/unique-attempt.json --confirm-quiesced \
  --timeout-seconds 3600
python3 -B scripts/backup/backup.py verify --bundle /APPROVED/backups/unique-bundle
```

Each fresh bundle contains `database.dump` (custom format), `uploads.tar.gz` and a versioned
`manifest.json` with UTC creation time, source DB name, PostgreSQL major, consistency attestation,
byte counts and SHA-256 digests. The manifest is written last, after dump/archive creation and
`pg_restore --list`; backup then verifies the bundle. Permissions default to directories 0700
and files 0600 via umask. **SHA-256 establishes accidental-corruption integrity, not authenticity**:
an attacker can replace data and manifest together. Restore only trusted backups; PostgreSQL
dumps may contain executable database definitions. Use authenticated encryption/signatures
and independent key custody for tamper protection.

All PostgreSQL child commands have a configurable finite deadline (default 3600 seconds,
maximum 86400). PostgreSQL failure details are withheld from unattended output because they
can contain object data; inspect privileged local server/client diagnostics when needed.
A nonzero exit means failure. A failed backup can leave a **partial, untrusted bundle**;
a missing manifest or failed `verify` makes it ineligible for restore or retention decisions.
Do not manually manufacture a successful manifest. No script deletes partial or existing data.

## Restore to a new isolated target

Keep application writers/workers and external delivery disabled. Validate the bundle, provision
a separate PostgreSQL 16 recovery instance with no application connections, and choose a new
database named `washflow_restore_*` plus a new uploads directory. Restore requires the exact
`--approve-target host:port/database` token and refuses **any existing database, including empty
ones**, existing uploads directory/file/symlink, the source database, unsafe archive entries,
checksum mismatches and non-loopback hosts. It never runs DROP, `--clean` or resets migrations.
Symlinks, hardlinks, special files, duplicate archive paths and traversal entries are rejected.
Keep restore targets/bundles inaccessible to concurrent untrusted filesystem writers.

```bash
python3 -B scripts/backup/backup.py restore \
  --host 127.0.0.1 --port 15435 --user recovery_operator \
  --database washflow_restore_incident_20261025 \
  --pg-bin /APPROVED/postgresql16/bin --passfile /PRIVATE/recovery.pgpass \
  --bundle /APPROVED/backups/unique-bundle --uploads /APPROVED/restored-uploads-new \
  --approve-target 127.0.0.1:15435/washflow_restore_incident_20261025 \
  --timeout-seconds 3600
```

The checksum/archive preflight happens before target writes. The new DB is restored in one
transaction with exit-on-error. If a later restore/extraction step fails, the **new** DB and
uploads may remain incomplete; never point the app at them. Inspect them, record the failure,
and choose new targets for retry. Cleanup of an explicitly identified recovery target is a
separate operator decision; the tool never auto-deletes a DB or directory.

Before cutover, compare tenant counts, critical rows/foreign keys, booking times, money totals,
idempotency records and each referenced photo's bytes/availability; inspect migration state
without applying migrations first. Use the compatible recorded image revision. Do not start
the normal backend just to inspect: its startup runs migrations and its process starts cron,
queues and integrations. After approval, switch DB and uploads together, grant runtime-role
access, reconcile Redis/external state below, start deliberately, and verify health, login,
tenant isolation, photo retrieval and a synthetic booking/payment scenario in isolation first.
Record elapsed recovery time, chosen backup timestamp and actual data-loss window.

## Redis and external side effects

Redis 7 has AOF persistence in production and `noeviction`; these are not independent backups.
This bundle does **not** include Redis. It contains BullMQ queues (`notifications`, `analytics`,
`booking-confirmations`), Paddle webhook `paddle:webhook:*` deduplication keys (24-hour TTL),
and disposable `paddle:prices:*` cache. PostgreSQL mutation idempotency records are stored in
`idempotency_keys` and **are** part of the DB dump; restoring an older dump also rolls those back.

Keep workers, payments, notifications and webhook ingress paused while deciding whether Redis
can be recovered from a separately tested, time-compatible persistence snapshot. Neither a
newer Redis against an older DB nor an older Redis snapshot guarantees correct effects: jobs
can reference missing orders, replay sent emails, miss confirmations or apply stale timeout
decisions. Empty Redis loses delayed/pending work and webhook deduplication. Do not flush,
blindly replay all queues or bulk re-enqueue on startup. Inventory pending/active/delayed/failed
jobs and reconcile each class against restored order/booking state and provider delivery history.
Recreate only demonstrably missing work after review. Domain events have no durable outbox,
so a DB restore alone cannot reconstruct every lost side effect.

Paddle is external authoritative billing state and does not roll back with PostgreSQL. Reconcile
subscriptions/transactions with the provider and review retried webhook event IDs before
reopening ingress; lost dedupe keys may allow a replay, while retained keys may suppress an
event whose DB effect was rolled back. Preserve external evidence and reconcile before enabling
payments. Cache prices can refresh; cache recovery does not recover queues or deduplication.
Application signing keys, provider credentials and deployment secrets are not included. Database
authentication records (password/refresh-token hashes and password-reset records) **are sensitive
backup contents** and are restored; account/session state can roll back with them. Review session
and credential handling with the incident owner before cutover. No real provider calls occur
in the synthetic drill.

## Scheduling, retention, encryption and offsite checklist

The inert [cron example](../../scripts/backup/schedule.example.cron) specifies the required
maintenance wrapper, exclusive scheduling lock and cleanup/resume behavior. It is deliberately
commented and uninstalled. Review scheduler timezone, permissions, capacity, timeout and overlap
behavior, then separately authorize installation. Never schedule the direct CLI with an
unconditional quiescence flag against active writers.

`--record` exclusively creates an owned JSON attempt file: format `washflow-backup-attempt-v1`,
status `running`/`success`/`failed`, UTC `started_at`/`updated_at`, and bundle path. Normal failures
record `failed`; an abrupt kill can leave `running` (or an incomplete JSON file), which monitoring
must treat as failed/stale after the deadline. A success record plus valid manifest identifies
a completed backup. Later monitoring should alert on nonzero exit, malformed/failed/stale-running
records and no **verified successful** backup within the selected interval plus grace period.
Do not infer success from directory existence or the latest attempt alone. No monitoring is
activated here.

Operator checklist before production activation:

- Select retention and storage budget. Example proposal: six-hour backups for seven days,
  daily for 30 days, monthly for 12 months; regulatory/business needs may differ.
- Delete only explicitly tool-owned, successfully verified bundles inside the approved backup
  root, after confirming required newer/offsite copies. Never prune uploads, unknown files,
  partial backups or user directories automatically. This tool has **no pruning command**.
- Encrypt before offsite transfer using an approved authenticated-encryption tool and recipient
  key; keep decrypt keys outside the source host and verify recovery with separate key access.
- Choose an offsite account/bucket, least-privilege writer, retention/immutability policy,
  network controls and integrity/authenticity verification. No destination is configured here.
- Obtain separate authorization for offsite credentials, transfer, schedule installation and
  deletion policies; no deployment or external write is implied by this runbook.
- Verify encrypted download/decryption in isolation and repeat restore drills after schema/tool
  changes and on a regular owner-approved cadence. Track RPO/RTO and escalation contacts.

## Reproducible isolated drill and evidence

Run from the repository root with Python 3.11+, local Unix-socket Docker context and an
**already present** `postgres:16-alpine` image. The drill refuses remote Docker contexts and
uses `--pull=never`; missing Docker/image is a blocker, with **no real database fallback**.

```bash
python3 -B -m pytest -p no:cacheprovider test/backup -q
python3 -B scripts/backup/drill.py --run-synthetic
```

The drill creates a UUID-named `washflow-backup-drill-*` container, `--network=none`, no published
ports, tmpfs PGDATA and no shared volumes. Trust authentication exists only inside that isolated
synthetic container. Generated task-owned client wrappers run **container PostgreSQL 16 tools**
over internal loopback; host PostgreSQL 18 is not used. It does not use or collide with the
existing migration/concurrency protocol on `127.0.0.1:15433`. It creates source/recovery DB names
with random suffixes and three small synthetic tables (tenant, FK-linked vehicle with money,
timestamp/photo path, idempotency JSON), plus binary uploads. This tests backup mechanics;
it does not certify production data volume, full application-schema coverage or external recovery.

Recorded on 2026-10-25: PostgreSQL 16 roundtrip preserved all **3 table rows** and upload bytes;
four real refusal cases passed (unapproved token, existing DB, existing uploads, corrupt dump).
The safety suite additionally checks archive traversal/links/special files, remote/connection
injection, inherited PG settings, preserved uploads targets and attempt records. The drill's
`finally` stops only the exact container ID it created; `--rm` removes it and its anonymous
resources, and the temporary fixture directory under `scripts/backup/` is removed. Normal
completion reports `DRILL PASS` and `CLEANUP OK`; if interrupted beyond cleanup, inspect the
printed UUID/container ID and remove **only** that owned resource after review.

## Automated encrypted offsite tooling — inactive

`scripts/backup/scheduled.py` implements one attempt. It does not install itself. Its explicit
private JSON configuration must contain exactly these fields (placeholder shape only):

```json
{
  "root": "/opt/washflow",
  "database": "washflow",
  "backup_root": "/PRIVATE/approved-backups",
  "gpg_home": "/PRIVATE/public-only-keyring",
  "recipient": "FULL_APPROVED_UPPERCASE_PUBLIC_KEY_FINGERPRINT",
  "endpoint": "https://APPROVED-S3-ENDPOINT",
  "bucket": "approved-existing-bucket",
  "profile": "approved-writer-profile",
  "prefix": "washflow/backups"
}
```

All parent directories and configuration/keyring must be owned by the operator, with private
permissions (directories 0700, files 0600). The target database is explicit and validated; no
`.env`, default PostgreSQL connection or `POSTGRES_DB` fallback is read.
Configuration contains no passwords or private key material. Runtime reads a deliberately
selected AWS named profile; environment AWS credentials/endpoints are removed and instance
metadata lookup is disabled. Provisioning that profile, recipient keyring and remote policy
is future operator work. The tool does not create or rotate production keys or buckets.

Capture shares the deployment tool's exact `/opt/washflow/releases/.deploy.lock`. A separate
`backup_root/.backup.lock` refuses overlapping backup attempts, including their transfers.
Preflight requires the existing healthy four-service topology, the current immutable backend
image, exactly `node dist/main.js`, a single known uploads volume, matching PG16 clients/server,
no other container using that volume/backend image and sufficient local disk. Unknown startup
commands (including migration-bearing commands) fail before stopping anything. It snapshots
the backend's identity, image, command, labels and mounts; changed identity refuses recovery.

Only the existing backend container is stopped. With it stopped, the tool requires no other
database clients, captures a custom PG16 dump and Docker uploads tar, then checks writers again.
Each child command has a finite timeout and its process group is terminated on timeout or
ordinary interruption. The same backend ID/image is started and health-checked in `finally`,
including a failed/partial stop or dump. No images are pulled, containers recreated, migrations
run, database sessions killed or Compose settings changed. The same container keeps its
network identity, so frontend recreation is unnecessary. App resume and health verification
finish **before** compression, encryption or any network transfer. The deploy lock then releases.

Docker upload entries are validated for traversal, links, special files, duplicates and path
conflicts before normalization into the existing `washflow-local-v1` format. The wrapper's
automatic quiescence checks substantiate that format's legacy consistency field. It adds
private capture/resume records. Before attempting any stop, `capture/pre-stop.json` records the
validated backend ID, immutable image ID, node-only command, mounts and selected Compose labels.
Its file and parent directory are fsynced; new attempt-directory entries are also fsynced.
Persistence failure prevents the stop. This pre-stop record survives a normal filesystem crash
recovery and provides the exact target even if SIGKILL/reboot prevents later phase records.
Packaging failure after resume cannot be reported as success.
New directories are used for every attempt; existing bundles are never overwritten or pruned.
Private raw dumps, upload tars, plaintext packaging, ciphertext and readback remain on disk;
capacity and retention must be reviewed before activation. No automatic deletion is implemented.

GnuPG 2.2.8+ runs with `--no-options`, an explicit private public-only source keyring, disabled
key discovery and a pinned full recipient fingerprint. Nonempty private-key directories are
refused on the source. AES256 encryption uses modern OpenPGP integrity protection (MDC, or
GnuPG's AEAD when negotiated). No insecure ignore-MDC/legacy override is supported. This is
**integrity-protected encryption, not proof of sender identity**: anyone holding the public
key can encrypt a replacement. Keep decryption keys separately, off the source host. Approved
storage controls and an independently retained trusted receipt are part of recovery trust.

The S3 adapter requires an explicit HTTPS endpoint, bucket, profile and prefix. It uses a
unique object key plus conditional `If-None-Match: *`, finite network deadlines and at most
three AWS attempts. Providers must support conditional PutObject and SHA256 checksums; unknown
capabilities fail, with no overwrite fallback. It downloads the uploaded ciphertext into a
fresh local path and compares SHA256 before writing a successful receipt. That readback check
proves upload fidelity — the stored object equals the locally encrypted ciphertext — not
recoverability: because the source keyring is public-only, decryption is deliberately deferred
to the separate recovery drill, which holds the recovery key. Upload errors, partial downloads
and mismatched readback fail; an ambiguous failed upload may leave an object without a success
receipt. Nothing deletes it automatically. Receipts identify the exact endpoint/bucket/key,
ciphertext checksum, recipient fingerprint and byte size.

`attempt-started.json`, `capture/pre-stop.json`, `capture/capture.json`, `capture/resume.json` (or `resume-failed.json`),
`offsite/transfer-started.json`, `offsite/transfer-failed.json`, `offsite/receipt.json`, and the
terminal `attempt-success.json`/`attempt-failed.json` distinguish phases. A running attempt with
no success record after the configured deadline is failed/stale, including reboot/SIGKILL.
Logs withhold child/provider diagnostics and backup contents. A resume failure emits the
prominent `BACKEND RESUME FAILED: OPERATOR RECOVERY REQUIRED`; transfer is not attempted.

Ordinary TERM/INT/HUP enters bounded backend recovery. **SIGKILL, power loss, daemon failure or
host reboot cannot guarantee `finally` runs.** Before enabling a schedule, an operator must
supervise stale records and backend health and approve an incident recovery procedure: acquire
the same deploy lock, verify the recorded exact backend ID/image/node-only command/mounts are
still current, settle any previously accepted stop before starting only that container and
verify health. A timed-out/disconnected Docker stop client does not cancel its daemon-side
operation: healthy/running inspection alone is not evidence of recovery. Automated ordinary
recovery reissues bounded idempotent stop, requires its acknowledgement plus stopped identity,
then starts the original ID and verifies health. Failed settlement is an operator-required
resume failure, never a healthy success. Never blindly restart
a legacy migration-bearing command or replace an unknown container. Repeated signals are
ignored during ordinary capture recovery. The inactive service template gives recovery six
minutes on TERM and avoids killing child recovery processes; it cannot solve a host outage.
Every recovery inspection, stop settlement, start and health check shares a single 300-second
deadline; each subprocess receives only its remaining budget. Ten seconds are reserved for
child cleanup, with a further minute before the supervisor's six-minute grace for records and
signal restoration. A slow inspection cannot reset or extend recovery's overall deadline.
Keep an escalation contact and independent health/stale-backup monitoring before activation.

The [service](../../scripts/backup/washflow-backup.service.example) and
[timer](../../scripts/backup/washflow-backup.timer.example) are **uninstalled examples**, not an
active six-hour schedule. They require reviewed paths/operator/window, supervisor recovery,
key custody, retention/capacity, provider capabilities and separate activation authorization.
No production capture or actual remote transfer has been run for this implementation.

## Verify a downloaded copy in isolation — future operator use

On a separate recovery machine, provide the independently trusted private receipt, explicit
read-only storage profile and approved recovery keyring (unlock it separately if necessary).
`scripts/backup/recover.py --receipt /PRIVATE/receipt.json --profile APPROVED_READER
--gpg-home /PRIVATE/recovery-keyring --work-root /PRIVATE/new-recovery-attempts` downloads the
exact object, verifies the pinned ciphertext checksum, and requires successful GPG integrity
validation **before extracting or restoring anything**. There is no fallback to the local
original bundle. Only the three allowlisted regular bundle files are extracted; normal backup
integrity/archive checks run afterward. Plaintext stays private in the new recovery workdir.

The recovery check uses an already-present `postgres:16-alpine` image in a local Unix-socket
Docker context, `--pull=never`, `--network=none`, no published ports, a size-capped tmpfs PGDATA
and no shared volumes. The container runs with bounded memory/pids, `no-new-privileges` and
dropped capabilities (only the filesystem/setuid caps PostgreSQL needs to bootstrap are kept),
so a malicious or oversized dump cannot exhaust the host. It restores a fresh `washflow_restore_*`
database transactionally, verifies public tables exist and compares every restored upload's
bytes with the validated archive. It never starts application workers, migrations, mail,
payments or webhooks. Its `finally` stops only the exact synthetic container it created; a host
outage still needs owned-resource inspection.
Successful mechanical recovery is not full business validation: production-sized RTO, tenant
counts/critical rows, foreign-key/domain invariants, times/money and external state still need
the incident checks above. No production RPO/RTO guarantee follows from a small synthetic drill.

The extended `drill.py --run-synthetic` generates disposable synthetic keys in a short private
`.wfb-*` directory under the Projects tree (macOS GPG socket paths require it), imports only the
public key into a distinct source keyring, and uses a filesystem transport fake. It checks real
GPG encryption/decryption plus ciphertext tamper rejection, restores the **downloaded/decrypted**
copy in PG16 and preserves the existing three-table row/money/time/idempotency/photo roundtrip
and four refusal checks. Only fixture-owned agents, containers and directories are cleaned.
This verifies code paths and recovery mechanics without any real cloud account or data.
