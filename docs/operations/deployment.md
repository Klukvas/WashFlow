# P0 application deployment

The existing main CI gates build/test the application, publish full commit-SHA backend and
frontend images, then run the guarded deployment helpers in `scripts/deploy/`. This route
requires the existing `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` and Docker Hub image
configuration. It adds no production secret or environment variable. No workflow has been
dispatched and no production access is established by local verification.

## Preconditions and read-only gates

The remote user needs Docker/Compose access, Python 3.11+, write access to the existing
`/opt/washflow` deployment directory, and adequate disk/memory. The existing base files must
be regular non-symlink `/opt/washflow/docker-compose.yml` and `.env`. Their contents are never
printed or copied; their hashes and the running project/container/image/mount metadata are
recorded in a fresh private `releases/<full-sha>-<run-id>-<attempt>/preflight.json`.

Before any app update, the helper requires exactly one running backend/frontend/
PostgreSQL/Redis service in the same existing Compose project and directory, no other
container sharing the upload volume or backend image, PostgreSQL 16/UTF8 and matching PG16
archive tools. A database socket inside the existing PostgreSQL container uses its existing
authentication context; passwords/connection URLs are never extracted or exported.

Backend, PostgreSQL and Redis must all be healthy. Frontend must also be healthy, with one
narrow exception for the observed legacy check: a running/unhealthy frontend whose health
test is exactly `['CMD','wget','-qO-','http://localhost:80/']`, whose one-to-five retained recent
checks all exited 1 with the exact known connection-refused message, and whose bounded
`http://127.0.0.1:80/` GET succeeds. Docker returns only a command-match boolean and static
error classification; raw health output is withheld. Unknown commands/errors, missing checks,
failed IPv4 GET or an unhealthy other service still refuse before stopping the backend. This
proves the localhost-check defect; IPv6/address selection remains an explanation, not direct proof.

`expected.py` applies the repository's migration SQL to a fresh network-none/tmpfs PG16
reference container on the CI runner. The container is removed by exact task-owned name.
It records every migration's full SHA256 and a canonical public-schema catalog fingerprint.
Production checks use read-only transactions: all expected successful migration names and
checksums must match exactly, with no pending, unresolved failed or duplicate successful
entries. Explicitly rolled-back historical attempts are ignored. Catalog checks cover table,
column/type/default/nullability, constraint/index, enum, trigger and routine metadata; physical
column order is ignored. Unexpected public objects or drift fail closed. No application rows
are inspected and no production migration/schema command is run.

The full-SHA images are pulled while the old app is running. Their OCI revision, Docker
platform, immutable image IDs and repository digests are checked/recorded. An architecture
mismatch refuses deployment; this route does not introduce multi-platform builds. Free space
must cover twice the database plus upload size and 2 GiB headroom, both before and after pulls;
available memory must be at least 256 MiB. These conservative checks may require an operator
capacity decision; the script does not delete anything to free space.

## Paired backup and cutover

Main workflow runs are not cancelled by newer main commits. A host file lock serializes
deployments. A heartbeat pipe detects SSH EOF or 30 seconds of silence; interrupted commands
are bounded and recovery is attempted. An abrupt host/process kill can still prevent recovery.

The existing backend receives a 45-second graceful stop. That stops its HTTP, cron and BullMQ
writers together and leaves frontend/PostgreSQL/Redis running. The helper rechecks topology,
requires no other database client sessions, and repeats schema/configuration checks. This
blocks the app's ingress through the stopped backend; the checks assume there are no hidden
host/external upload writers. Unknown writers or client sessions refuse cutover.

While the backend remains stopped, a fresh private `backup/` receives a PostgreSQL custom
dump and the stopped backend's uploads tar through Docker. The helper validates `pg_restore
--list`, every tar member/path/type and readable file bytes, then records and rechecks SHA256
digests in a completed backup manifest. Symlinks/hardlinks/special/traversal/duplicate archive
members are refused. No archive is extracted. A failed/partial bundle remains private and is
not an eligible verified backup. A backup/stop failure recreates **both** old immutable image
IDs with the node-only rollback override and bounded health checks, refreshing frontend DNS.
It never uses `docker start` to rerun a legacy migration-bearing backend command.

Only after backup verification does an override select the two recorded immutable image IDs.
The existing `.env` and base Compose remain byte-identical. The narrowly explicit P0 runtime
override uses `node dist/main.js` for backend: startup migrations are bypassed **only after the
zero-pending/schema-parity gate**. Both new and rollback overrides set only frontend
`healthcheck.test` to `['CMD','wget','-qO-','http://127.0.0.1:80/']`, inheriting the existing
interval, timeout and retry settings. The live base Compose and environment remain unchanged.
Both app
services are recreated with `--force-recreate --no-deps --no-build --pull never`, including
an unchanged frontend image so its DNS and Compose metadata refresh together with backend;
no infrastructure recreation,
`remove-orphans`, image pruning, registry reconfiguration, seed or real-data smoke mutation
occurs. Health checks require the expected image ID as well as healthy status, with deadlines.

Backend startup resumes HTTP, cron and BullMQ together before health is confirmed. There is
no separate worker pause or notification/provider policy change. Background writes can begin
immediately. Success/failure output is a bounded status JSON; raw subprocess errors, full
inspect/config/environment dumps and application logs are withheld.

## Rollback and retained evidence

`rollback.json` retains both old immutable image IDs. The failure phase is set before Compose
updates, so a partial recreate also attempts app-only rollback and bounded health checks.
The rollback override also bypasses migration startup with `node dist/main.js`. Subsequent
deployments accept an owned private `images.json` or `rollback.json` only when its image IDs
match the running apps and it contains exactly the image/node-command policy above, with
either the legacy frontend image-only shape or the exact fixed IPv4 test-only healthcheck.
Arbitrary healthcheck fields, URLs and runtime policy remain forbidden. Old images,
the live environment/base Compose, database and volumes are never removed or repinned by tag.
Recovery failure is reported as failure; do not assume that a failed CI job restored health.

An operator may inspect the private `preflight.json`, `images.json`, `rollback.json`, backup
manifest and `result.json` on the host. Never publish dump/upload contents as CI artifacts.
For a manually reviewed application rollback, use the recorded project from preflight:

```bash
docker compose --project-name <recorded-project> --project-directory /opt/washflow \
  --env-file /opt/washflow/.env -f /opt/washflow/docker-compose.yml \
  -f /opt/washflow/releases/<recorded-release>/rollback.json \
  up -d --force-recreate --no-deps --no-build --pull never backend frontend
```

Verify the exact expected image IDs and both health statuses afterward. App rollback cannot
undo post-start database writes, queue deliveries or provider effects. There is no automatic
database restore or migration-down path. Data recovery remains a separately coordinated
[paired new-target restore](backup-recovery.md), including Redis/external reconciliation.
Backups here are local, unencrypted, unpruned logical archives; offsite/PITR/retention and
production-sized recovery objectives are not established by this deployment helper.

## Host trust and local verification

### Read-only diagnostic branch

The existing registered `ci.yml` also accepts `diagnostic_only=true` on a reviewed `codex/`
branch. [GitHub supports selecting a non-default ref](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)
for a workflow already registered on the default branch:

```bash
gh workflow run ci.yml --repo Klukvas/WashFlow --ref <reviewed-codex-branch> -f diagnostic_only=true
```

This mode disables every normal lint/test/build/publish/deploy job and runs only the bounded
read-only probe using the existing repository `DEPLOY_*` secrets. It creates no GitHub
production deployment record. A normal main run with the default false input retains every
release gate; diagnostic mode cannot skip tests into a release. Branch publication and dispatch
remain separate authorized actions; this command is not an instruction to dispatch automatically.

The probe executes standard-library Python through SSH stdin with `python3 -B - --probe`;
it uploads no files and imports no deployment/bootstrap helper. It only runs selected Docker
version, Compose version, container-list and formatted-inspect commands scoped to the existing
`/opt/washflow` Compose working-directory label. It never pulls, stops, starts, backs up,
locks, migrates, queries the database or changes files. Its portable syntax can report an older
Python version even when the deployment's Python 3.11 prerequisite fails.

Output contains numeric versions, selected app running/health/image IDs, and allowlisted
file-presence/private-path/hash-match booleans for the failed release
`209758a00089c0e48d26dd01c7c8e96868d440cd-40237451282-1`. Configuration bytes may be hashed
internally against its recorded preflight hashes; contents, hashes, paths from untrusted JSON,
environment values, host/user metadata and subprocess stderr are never forwarded. Unknown
JSON fields and arbitrary strings are discarded or rejected by a second local projection.
Observed prerequisite refusals describe current state. File presence alone cannot establish
historic stop/cutover, successful rollback or backup integrity; missing/invalid metadata remains
unknown. No dump or upload archive contents are read by this probe.
Frontend diagnostics also expose at most five recent health exit codes and exact known static
failure classes, a boolean matching the known localhost-wget test, and bounded GET outcomes
for only `http://localhost:80/` and `http://127.0.0.1:80/`. Raw health output, configured commands,
response bodies and stderr are discarded; these probes do not change the healthcheck or restart apps.

Capacity diagnostics add only CPU count, sysconf free-memory bytes, selected `/proc/meminfo`
MemTotal/MemFree/MemAvailable bytes, and deployment-filesystem total/free/available bytes.
Only bounded nonnegative integer byte values (up to 1 EiB) and CPU counts 1–65536 are emitted;
missing, malformed, duplicate or out-of-range fields become null. Raw meminfo and errors are
withheld. Whether sysconf free memory versus MemAvailable explains the capacity refusal is a
hypothesis pending production numbers; the deployment guard and 256 MiB reserve remain unchanged.

Transport failures now expose only static `stage` (`validation`, `bootstrap`, `remote`) and
allowlisted `reason` codes. Diagnostic access failures distinguish validation, SSH command and
interpreter/protocol stages using static codes. These codes do not include raw errors, secrets
or remote exception messages; a generic code still requires investigation rather than a retry.

The workflow retains its existing `ssh-keyscan` trust-on-first-use bootstrap because no pinned
host-key secret is evidenced. This is a documented trust limitation, not independent origin
authentication. Both SSH commands require strict checking against that collected host key,
BatchMode, IdentitiesOnly and disabled UpdateHostKeys; no verification bypass is added.

```bash
WASHFLOW_DEPLOY_DOCKER_TEST=1 python3 -B -m unittest discover -s test/deploy -p 'test_*.py' -v
actionlint .github/workflows/ci.yml
git diff --check
```

Fixtures cover Docker protocol failure ordering, config preservation, backup refusals,
partial cutover/health/interruption rollback, SSH options and heartbeat EOF/silence. The opt-in
real PG16 case verifies the 15-migration chain, read-only catalog gate, semantic column-order
equivalence versus type/null/index drift, and custom dump listing. It uses only newly created
network-none/tmpfs containers, with no published ports, shared volumes or production network.
