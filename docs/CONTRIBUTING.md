# Contributing to WashFlow

Practical guide for setting up, testing, reviewing and shipping WashFlow.

> **Working on the code?** Read [`context/README.md`](context/README.md) first — it is the
> canonical entry point and links to architecture, modules, data model, frontend and
> infrastructure documentation. This file covers _workflow_; those cover _the system_.

---

## Prerequisites

- **Node.js** 20+
- **pnpm** 9 (`corepack enable`)
- **Docker** & **Docker Compose**
- **PostgreSQL** 16 and **Redis** 7 (or use `docker-compose.dev.yml`)

---

## Development environment

### 1. Install dependencies

Three independent workspaces, three lockfiles. Never mix package managers.

```bash
pnpm install                                   # backend (root)
cd frontend && pnpm install && cd ..           # operator dashboard
cd frontend-booking && pnpm install && cd ..   # booking widget (optional)
```

### 2. Start infrastructure

```bash
docker compose -f docker-compose.dev.yml up -d
```

This starts:

- **PostgreSQL 16** on host port **5433** (container 5432) — database, user and password come
  from `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD`, defaulting to
  `washflow` / `washflow` / `washflow_secret`. Volume `postgres_dev`.
- **Redis 7** on port **6379**, no password, no volume.

Your `DATABASE_URL` must therefore point at port **5433**, not 5432.

### 3. Configure environment

```bash
cp .env.example .env
```

Fill in `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (both at least
32 characters). Payments default to disabled, including production Compose. Enable
`PAYMENTS_ENABLED=true` only with all three nonblank Paddle credentials (`PADDLE_API_KEY`,
`PADDLE_CLIENT_TOKEN`, `PADDLE_WEBHOOK_SECRET`); enabled validation applies in every environment.
`PAYMENTS_ENABLED` accepts only `true` or `false`, and partial credential sets are rejected.

**Set `PORT=3003`.** The backend defaults to `3000`, but `frontend/vite.config.ts` and
`frontend-booking/vite.config.ts` proxy `/api` (and `/socket.io`) to `http://localhost:3003`, and
the CI Playwright job starts the backend on 3003 too.

The full variable reference lives in
[`context/infrastructure.md`](context/infrastructure.md#3-environment-variables) — it is
maintained in one place so it cannot drift. Never commit real values; `.env` and `.env.docker`
are gitignored.

### 4. Set up the database

```bash
npx prisma generate
npx prisma migrate dev      # or `migrate deploy` if you are not changing the schema
pnpm seed                   # optional demo data (idempotent)
```

### 5. Run

```bash
pnpm start:dev                     # backend  → http://localhost:3003 (with PORT=3003)
cd frontend && pnpm dev            # dashboard → http://localhost:5173
cd frontend-booking && pnpm dev    # widget    → http://localhost:5174
```

Run dev servers in tmux so logs stay accessible:

```bash
tmux new -s dev 'pnpm start:dev'
tmux attach -t dev
```

Swagger UI is available at `http://localhost:<PORT>/api/docs` whenever
`NODE_ENV !== 'production'`.

---

## Available scripts

### Backend (project root)

| Command            | Description                                                           |
| ------------------ | --------------------------------------------------------------------- |
| `pnpm build`       | Compile with `nest build`                                             |
| `pnpm start`       | Start (no watch)                                                      |
| `pnpm start:dev`   | Start with hot reload                                                 |
| `pnpm start:debug` | Hot reload + Node inspector                                           |
| `pnpm start:prod`  | Run `dist/main`                                                       |
| `pnpm format`      | **Writes** — `prettier --write` over `src/**/*.ts` and `test/**/*.ts` |
| `pnpm lint`        | **Writes** — `eslint "{src,apps,libs,test}/**/*.ts" --fix`            |
| `pnpm test`        | Jest unit tests (`rootDir: src`, `*.spec.ts`)                         |
| `pnpm test:watch`  | Jest in watch mode                                                    |
| `pnpm test:cov`    | Jest with coverage → `coverage/`                                      |
| `pnpm test:debug`  | Jest with the Node inspector attached                                 |
| `pnpm test:e2e`    | Jest E2E (`test/jest-e2e.json`) — needs PostgreSQL + Redis            |
| `pnpm seed`        | `npx prisma db seed`                                                  |
| `pnpm db:reset`    | **Destructive** — `npx prisma migrate reset`                          |

> `pnpm lint` and `pnpm format` modify files. For a read-only check use:
>
> ```bash
> pnpm exec eslint "{src,apps,libs,test}/**/*.ts"
> pnpm exec prettier --check "src/**/*.ts" "test/**/*.ts"
> pnpm exec tsc -p tsconfig.json --noEmit
> ```

### Frontend (`frontend/`)

| Command                | Description                                                      |
| ---------------------- | ---------------------------------------------------------------- |
| `pnpm dev`             | Vite dev server on 5173 with `/api` + `/socket.io` proxy to 3003 |
| `pnpm build`           | `tsc -b && vite build && node scripts/prerender-meta.mjs`        |
| `pnpm preview`         | Preview the production build                                     |
| `pnpm lint`            | `eslint .` — read-only, no `--fix`                               |
| `pnpm test`            | Vitest, single run                                               |
| `pnpm test:watch`      | Vitest watch mode                                                |
| `pnpm test:e2e`        | Playwright                                                       |
| `pnpm test:e2e:ui`     | Playwright UI mode                                               |
| `pnpm test:e2e:report` | Open the last Playwright HTML report                             |

### Booking widget (`frontend-booking/`)

`pnpm dev` (port 5174) · `pnpm build` · `pnpm preview` · `pnpm lint` · `pnpm test:e2e`
(+ `:ui`, `:report`). There is no unit-test setup here.

---

## Testing

```bash
pnpm test                       # backend unit
pnpm test:cov                   # backend unit + coverage
pnpm test:e2e                   # backend E2E (PostgreSQL + Redis required)
cd frontend && pnpm test        # frontend unit (Vitest)
cd frontend && pnpm test:e2e    # frontend E2E (Playwright)
```

**Backend (Jest + `@nestjs/testing`)** — unit specs live next to their source as `*.spec.ts`;
wire modules with `Test.createTestingModule()`; mock collaborators with `jest.fn()`; never touch
a real database in a unit test. E2E specs live in `test/*.e2e-spec.ts` and do use a real
database. `NODE_ENV=test` disables rate limiting
(`ThrottlerModule.forRoot([])` in `src/app.module.ts`), which is why E2E runs are not throttled.

### Isolated PostgreSQL concurrency checks

`test/repair-concurrency.e2e-spec.ts` is opt-in. With no
`WASHFLOW_REPAIR_TEST_DATABASE_URL`, all its tests are explicitly skipped; it never falls
back to `DATABASE_URL` and never imports `.env`. A supplied URL must target
`127.0.0.1:15433`, a dedicated `washflow_repair_*` database, and have no query/hash overrides.
The companion Prisma config applies the same guard. Use a new task-owned PostgreSQL 16
container with loopback publishing and tmpfs storage, synthetic credentials, and no shared
volume. Never point this suite at existing application data.

After explicitly creating the new empty database and setting that dedicated URL:

```bash
pnpm exec prisma generate --config test/repair-prisma.config.ts
pnpm exec prisma migrate deploy --config test/repair-prisma.config.ts
pnpm exec jest --config test/jest-e2e.json --runTestsByPath test/repair-concurrency.e2e-spec.ts --runInBand
```

The suite uses real Prisma services/repositories and concurrent PostgreSQL transactions, with
an event emitter that has no subscribers. It starts no app module, cron, Redis or external
integration. Each fixture has its own tenant and distinct inputs. Tests wait for two actual
PostgreSQL lock waiters, assert business rejections and final scoped counts, and cover payment
caps/exact decimals, create/restore resource reservations, a changed locked post causing raw
serialization failure, explicit JSON-null resource/tenant guards, and all four quota resources
across create/create, create/restore and restore/restore races. The entire disposable database belongs
to the test; clean up only its owned container when evidence inspection finishes.

The 15-migration chain now matches the Prisma schema, including the retained trial partial
index. Verify the deployed schema before running the concurrency suite:

```bash
pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script --exit-code --config test/repair-prisma.config.ts
```

Expected: `-- This is an empty migration.` and exit 0. The concurrency suite can therefore run
against the migration-built database; no `db push` workaround is needed. Existing databases
must use the forward migration, with the maintenance/UTC assumptions described in
[infrastructure.md](context/infrastructure.md#verified-migrationschema-drift).

The separate upgrade regression suite accepts only `WASHFLOW_MIGRATION_TEST_DATABASE_URL`
pointing to a task-owned `washflow_repair_migration_*` database on `127.0.0.1:15433`, without
query/hash overrides. It never imports `.env` or falls back to `DATABASE_URL`; with no URL all
five tests are skipped. Create that **new empty database** in the same disposable PostgreSQL
16 container, then run:

```bash
pnpm exec jest --config test/jest-e2e.json --runTestsByPath test/migration-drift.e2e-spec.ts --runInBand
```

It creates a unique schema per test, applies the checked-in SQL and synthetic fixtures, and
removes only those owned schemas. This is a developer verification command that writes only
to the disposable database; a read-only reviewer should inspect its recorded evidence or run
non-mutating checks. It tests the old-chain upgrade, existing data and timezone preservation,
ordinary Prisma operations, index retention and atomic photo-column conflict handling.

### Browser race regressions

The focused public-booking tests intercept synthetic API responses and do not create real
bookings. Each config writes to its own app's `test-results/booking-selection` subdirectory,
so reruns preserve other suites' evidence. Start the dashboard on 5179 and widget on 5180 in
tmux, then run:

```bash
cd frontend && pnpm exec playwright test --config playwright.booking-selection.config.ts
cd ../frontend-booking && pnpm exec playwright test --config playwright.booking-selection.config.ts
```

### Frontend testing

**Frontend (Vitest + Testing Library)** — tests live in `__tests__/` folders beside the code;
assert on what the user sees; mock the network.

**Playwright** — `frontend/playwright.config.ts` defines setup projects plus role-specific
projects (`chromium` as admin, `fresh-tenant`, `role-operator`, `role-receptionist`,
`role-manager`). Credentials come from `frontend/.env.test`, which is **gitignored**: create it
locally with `PLAYWRIGHT_EMAIL`, `PLAYWRIGHT_PASSWORD` and `PLAYWRIGHT_TENANT_ID`.

**What to test**, in priority order: core and tricky logic first (scheduling, pricing, state
machines, limits), then a regression test for every bug fixed, then one E2E per critical flow.
Do not chase a coverage number — one meaningful test on risky code beats ten on trivial glue.

---

## Code style

ESLint + Prettier + `tsc --noEmit`. Backend lint config is `eslint.config.mjs`
(typescript-eslint `recommendedTypeChecked` + `eslint-plugin-prettier`, with the `no-unsafe-*`
family relaxed inside `*.spec.ts` / `test/**`). Prettier config is `.prettierrc`
(`singleQuote: true`, `trailingComma: "all"`).

Conventions that matter here:

- **Immutability** — return new objects; never mutate in place.
- **Files** 200–400 lines typical, 800 hard max; **functions** under ~50 lines.
- **Repository pattern** — only `*.repository.ts` (and a documented set of services) touch
  Prisma. Business rules and transactions live in services.
- **Tenant safety** — go through `tenantPrisma.forTenant(tenantId)`; inside a `$transaction` the
  tenant filter is manual.
- **Validation** — `class-validator` DTOs at the controller boundary; Zod for environment only.
- **Errors** — never swallow; user-facing messages stay friendly, logs carry the detail.
- **No `console.log`** in committed code; use the Nest/pino logger.
- **No hardcoded secrets.**

---

## Pull request checklist

- [ ] `pnpm exec eslint "{src,apps,libs,test}/**/*.ts"` is clean
- [ ] `pnpm exec tsc -p tsconfig.json --noEmit` is clean
- [ ] `pnpm test` passes; new logic has a test
- [ ] `pnpm build` succeeds
- [ ] `cd frontend && pnpm lint && pnpm test && pnpm build` succeeds (if the UI changed)
- [ ] Migrations reviewed by hand — backfills before constraints, forward-only
- [ ] No secrets, no `.env` values, no debug output
- [ ] Documentation updated per the
      [update matrix](context/agent-playbook.md#documentation-update-matrix) — including
      `OVERVIEW.md` for any business-logic or feature change
- [ ] PR description explains the **why**

---

## CI

`.github/workflows/ci.yml` runs on pushes and PRs to `main`, and via `workflow_dispatch` with
`skip_unit_tests` / `skip_e2e` inputs:

```
backend-lint ─┬─► backend-test ─┬─► backend-e2e ──┐
              │                 └─► frontend-e2e ─┤
frontend-lint ┴─► frontend-test ──────────────────┴─► build-and-push (main only) ─► deploy
```

Unit and E2E skips are independent: skipping unit tests does not suppress E2E. Explicit job
conditions allow only skips requested by their matching input; failed/cancelled lint or tests
and unintended skips block image publishing. Both E2E jobs explicitly enable payments and
provide all three synthetic sandbox Paddle credentials to satisfy startup validation.
Both E2E jobs initialize their fresh PostgreSQL service databases with
`pnpm exec prisma migrate deploy`, exercising the checked-in migration chain before tests.

Artifacts: `backend-coverage`, `playwright-report`, and `playwright-screenshots` on failure
(7-day retention). Full job detail, service containers and secrets:
[`context/infrastructure.md`](context/infrastructure.md#4-cicd--githubworkflowsciyml).

---

## Production runbook

### Deploy

Deployment is automated by the `deploy` job (SSH to the host, `docker compose up -d`). Manual
equivalent:

```bash
# On the server, in /opt/washflow
cp .env.docker.example .env      # fill in real values; never commit them
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --remove-orphans
docker compose -f docker-compose.prod.yml exec -T backend \
  wget -qO- http://localhost:3000/api/v1/health
```

`docker-compose.prod.yml` consumes prebuilt images (`DOCKER_IMAGE`, `DOCKER_IMAGE_FRONTEND`,
`DOCKER_TAG`); only the `frontend` service also declares a `build` context. Migrations run at
container start: the `backend` command is
`sh -c "npx prisma migrate deploy && node dist/main.js"`.

Startup order is enforced by healthchecks: **PostgreSQL + Redis → backend → frontend (nginx)**.
Production Redis preserves BullMQ/idempotency keys with `noeviction`; at its 1 GB memory
ceiling writes may fail with OOM. Monitor memory and queue health before exhaustion.
`METRICS_TOKEN` is passed through Compose and mapped to the guard's `metricsToken` config key.

Seeding is never automatic:

```bash
docker compose run --rm backend node dist/prisma/seed.js
```

### Health and metrics

| Endpoint              | Auth               | Checks                                                        |
| --------------------- | ------------------ | ------------------------------------------------------------- |
| `GET /api/v1/health`  | Public             | `database` (Prisma ping), `redis`, `queues` (3 BullMQ queues) |
| `GET /api/v1/metrics` | `MetricsAuthGuard` | Prometheus: request histogram + counter + Node defaults       |

`MetricsAuthGuard` requires `Authorization: Bearer $METRICS_TOKEN` when `METRICS_TOKEN` is set.
**When it is not set, access is denied in production** and allowed in dev/test.

Healthy response: HTTP 200 with
`{"status":"ok","info":{"database":{"status":"up"},"redis":{"status":"up"},"queues":{...}}}`.

```yaml
scrape_configs:
  - job_name: washflow-backend
    metrics_path: /api/v1/metrics
    static_configs:
      - targets: ['backend:3000']
```

### Common issues

| Issue                       | Symptom                                                | Fix                                                                                                                        |
| --------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Env validation failure      | Process exits with a Zod error list                    | Compare names against `src/config/env.validation.ts`                                                                       |
| CORS misconfiguration       | `CORS_ORIGINS must not be "*" in production. Exiting.` | Set explicit origins                                                                                                       |
| Migration failure           | Backend restart loop                                   | `docker compose exec backend npx prisma migrate status`                                                                    |
| Redis connection refused    | Health `redis: down`                                   | Check container logs; verify `REDIS_PASSWORD` matches `REDIS_URL`                                                          |
| Queues unhealthy            | Health `queues: down`                                  | BullMQ shares `REDIS_URL` — same root cause as above                                                                       |
| Metrics 403 in production   | Scrape fails                                           | Set `METRICS_TOKEN` and configure the scraper's bearer credentials                                                         |
| Paddle webhooks not applied | Subscription state stale                               | Verify `PADDLE_WEBHOOK_SECRET`; inspect `redis-cli --scan --pattern 'paddle:webhook:*'`                                    |
| Paddle mutations 503        | Checkout/cancel rejected                               | `PAYMENTS_ENABLED` must be `true`                                                                                          |
| Frontend blank page         | nginx 200 with an empty body                           | Check the browser console and the image tag; CI builds the frontend image with `VITE_PADDLE_SANDBOX` as its only build arg |

More symptoms and read-only diagnostics:
[`context/infrastructure.md`](context/infrastructure.md#9-safe-verification-and-troubleshooting).

### Rollback

Both services are pinned by the **same** `DOCKER_TAG` in `/opt/washflow/.env`
(`backend: ${DOCKER_IMAGE}:${DOCKER_TAG}`, `frontend: ${DOCKER_IMAGE_FRONTEND}:${DOCKER_TAG}`),
and the deploy job rewrites that file on every deploy. Roll back by pointing `DOCKER_TAG` at a
known-good **immutable** tag — the commit sha pushed by `build-and-push` — and recreating both
services:

```bash
# On the server, in /opt/washflow (the deploy job installs the compose file as
# docker-compose.yml there; add -f docker-compose.prod.yml if you kept the original name)

# 0. Record the current values — DOCKER_IMAGE, DOCKER_IMAGE_FRONTEND, DOCKER_TAG
grep '^DOCKER_' .env

# 1. Verify BOTH images exist under the target tag; they are separate repositories,
#    and a rollback that only has one of them will half-recreate the stack
docker pull "<DOCKER_IMAGE>:<sha>"
docker pull "<DOCKER_IMAGE_FRONTEND>:<sha>"

# 2. Pin the tag, then recreate backend + frontend
sed -i 's/^DOCKER_TAG=.*/DOCKER_TAG=<sha>/' .env
docker compose up -d --no-deps backend frontend
```

Notes:

- **Do not roll back by re-tagging `:latest` locally.** Compose resolves the image from
  `DOCKER_TAG`, so a local re-tag changes nothing unless `DOCKER_TAG` is literally `latest` —
  and `:latest` is overwritten by the next deploy anyway.
- `build-and-push` pushes both images with a sha tag **and** `latest`
  (`docker/metadata-action`: `type=sha,prefix=` + `type=raw,value=latest`), so a matching sha
  normally exists for both — but confirm it in step 1 rather than assuming.
- Undo the rollback the same way: put the previous `DOCKER_TAG` back, or redeploy from CI.
- The backend runs `npx prisma migrate deploy` at container start. Rolling the image back does
  **not** roll migrations back.

Database migrations are **forward-only** — write a new corrective migration rather than running
`prisma migrate reset` against real data.

### Configuration differences

| Setting                   | Production                                          | Development                                |
| ------------------------- | --------------------------------------------------- | ------------------------------------------ |
| Sentry `sendDefaultPii`   | `false`                                             | `false` (same)                             |
| Sentry `tracesSampleRate` | `0.05` unless `SENTRY_TRACES_SAMPLE_RATE` is set    | `1.0`                                      |
| Pino level / transport    | `info`; `pino-loki` + stdout when Loki vars are set | `debug` + `pino-pretty`                    |
| Swagger `/api/docs`       | disabled                                            | enabled                                    |
| Rate limiting             | enabled (`short` 10/1 s, `long` 100/60 s)           | enabled; **disabled** when `NODE_ENV=test` |
| HTTP request timeout      | 30 s (`server.setTimeout`)                          | 30 s                                       |

### Alerting suggestions

| Alert                | Condition                            | Severity |
| -------------------- | ------------------------------------ | -------- |
| Health check failing | `/api/v1/health` non-200 for > 1 min | Critical |
| High error rate      | 5xx > 5% of requests                 | High     |
| High latency         | p95 > 2 s                            | Medium   |
| Container restarts   | > 3 restarts in 10 min               | High     |

Backups, TLS termination and secret management are **not configured in this repository** — see
[`context/infrastructure.md`](context/infrastructure.md#8-known-unknowns).

---

## Git workflow

- Short-lived branches off `main` with descriptive names (`feat/checkout-retry`).
- Conventional commit subjects: `feat|fix|refactor|docs|test|chore|perf|ci: <description>`;
  the body explains the _why_.
- Small, coherent commits — one logical change each.
- Review your own diff (`git diff main...HEAD`) before pushing.
- **Commit and push only when asked.** If you are on `main`, branch first.
