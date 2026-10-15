# Agent Playbook

Task recipes for WashFlow. Each one lists the **minimum** files to open, the invariants you
must not break, and the checks to run. Load only the recipe you need.

**Entry point:** [README.md](./README.md)

---

## Before you start

```bash
git status                       # respect any pre-existing dirty state; never stash or reset it
git diff --stat                  # know what was already changed
```

`pnpm` only — three lockfiles (`pnpm-lock.yaml`, `frontend/pnpm-lock.yaml`,
`frontend-booking/pnpm-lock.yaml`). Never introduce npm or yarn.

### Lint, format, and type checks

| Intent                            | Command                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| Backend lint **read-only**        | `pnpm exec eslint "{src,apps,libs,test}/**/*.ts"`                                       |
| Backend lint **with autofix**     | `pnpm lint` ⚠️ this is `eslint … --fix` — it **rewrites files**                         |
| Backend format check              | `pnpm exec prettier --check "src/**/*.ts" "test/**/*.ts"`                               |
| Backend format write              | `pnpm format` ⚠️ `prettier --write`                                                     |
| Backend types                     | `pnpm exec tsc -p tsconfig.json --noEmit`                                               |
| Backend build                     | `pnpm build`                                                                            |
| Backend unit tests                | `pnpm test` · single file: `pnpm test -- src/modules/orders/orders.service.spec.ts`     |
| Backend coverage                  | `pnpm test:cov`                                                                         |
| Backend E2E                       | `pnpm test:e2e` (needs PostgreSQL + Redis; CI adds `--runInBand --forceExit`)           |
| Frontend lint (read-only already) | `cd frontend && pnpm lint` (`eslint .`, no `--fix`)                                     |
| Frontend types + build            | `cd frontend && pnpm build` (`tsc -b && vite build && node scripts/prerender-meta.mjs`) |
| Frontend unit tests               | `cd frontend && pnpm test` (Vitest)                                                     |
| Frontend E2E                      | `cd frontend && pnpm test:e2e` (Playwright)                                             |
| Widget lint / build               | `cd frontend-booking && pnpm lint` · `pnpm build`                                       |
| Markdown format check             | `pnpm exec prettier --check "docs/**/*.md" README.md OVERVIEW.md`                       |

> **Root `pnpm lint` is not read-only.** It is defined as
> `eslint "{src,apps,libs,test}/**/*.ts" --fix`. When you are reviewing rather than fixing, use
> the explicit `pnpm exec eslint …` form above. `frontend`'s `pnpm lint` (`eslint .`) has no
> `--fix` and is safe to run in a review.

---

## Recipe: add or change a backend endpoint

**Open**

```
src/modules/<feature>/<feature>.controller.ts
src/modules/<feature>/<feature>.service.ts
src/modules/<feature>/<feature>.repository.ts
src/modules/<feature>/dto/*.dto.ts
src/modules/<feature>/<feature>.module.ts        (only if wiring changes)
```

**Do**

1. Add the route to the controller. If the controller already has
   `@UseGuards(PermissionsGuard)`, add `@Permissions('<module>.<action>')`.
2. Use the existing param decorators: `@CurrentTenant()`, `@CurrentBranch()`, `@CurrentUser()`.
3. Validate the body with a `class-validator` DTO. The global `ValidationPipe` uses
   `whitelist` + `forbidNonWhitelisted`, so undeclared properties are a `400`.
4. Put business rules in the service, Prisma queries in the repository.
5. Return a plain object, or `paginatedResponse(items, total, dto)` for lists — the
   `TransformInterceptor` wraps it.

**Invariants**

- New permission strings must exist in the `permissions` table. Add them to
  `prisma/seed.ts` **and** a migration, and mirror them in
  `frontend/src/shared/constants/permissions.ts`.
- `@Public()` requires an explicit `@Throttle({ short: { … } })`.
- Never widen tenant scope: the repository must go through
  `tenantPrisma.forTenant(tenantId)`.

**Check**

```bash
pnpm exec eslint "src/**/*.ts" && pnpm exec tsc -p tsconfig.json --noEmit && pnpm test
```

**Update docs:** [reference.md](./reference.md) (route table), [modules.md](./modules.md)
(HTTP surface), and [features.md](./features.md) if it is user-visible.

---

## Recipe: change the data model / write a migration

**Open**

```
prisma/schema.prisma
prisma/migrations/                       (look at 20260304000000_fix_schema_drift for the backfill pattern)
src/prisma/tenant-prisma.service.ts      (SOFT_DELETE_MODELS / BYPASS_TENANT_MODELS)
src/modules/cleanup/cleanup.service.ts   (FK-ordered hard delete)
```

**Do**

1. Edit `schema.prisma`, then `npx prisma migrate dev --name <snake_case_name>`.
2. Review the generated SQL by hand — add backfills/dedup **before** any new constraint.
3. If the model is soft-deletable, add it to `SOFT_DELETE_MODELS` and to `CleanupService`.
4. If the model has no `tenantId`, add it to `BYPASS_TENANT_MODELS` **and** document how it is
   scoped in [data-model.md](./data-model.md#tenant-scoping-map).

**Invariants**

- Migrations are forward-only in production (`prisma migrate deploy`). Never ship
  `migrate reset`.
- There are currently **no partial unique indexes** — decide deliberately whether a new unique
  index needs `WHERE "deletedAt" IS NULL`.
- `Decimal(10,2)` for money. `@db.Timestamptz` for time. `uuid()` for ids.

**Check**

```bash
npx prisma validate
npx prisma migrate status
pnpm exec tsc -p tsconfig.json --noEmit      # regenerated client types
pnpm test
```

**Update docs:** [data-model.md](./data-model.md) (model detail, relations, migration history).

---

## Recipe: change a business rule

**Open** — pick by rule:

| Rule                            | Files                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Order status transitions        | `src/modules/orders/types/order.types.ts`, `orders.service.ts` (`updateStatus`, `restore`)                  |
| Order creation / pricing        | `src/modules/orders/orders.service.ts` (`create`, `resolveServicesAndPricing`, `enforceBookingConstraints`) |
| Work-post / employee assignment | `orders.service.ts` (`resolveWorkPost`), `orders/employee-eligibility.util.ts` (`reserveEmployee`), `src/modules/scheduling/scheduling.service.ts`  |
| Availability / slots            | `src/modules/scheduling/scheduling.service.ts`, `scheduling.repository.ts`                                  |
| Booking policy                  | `src/common/utils/booking-settings.util.ts`, `src/modules/branches/dto/booking-settings.dto.ts`             |
| Plan limits / add-ons           | `src/modules/subscriptions/plan.constants.ts`, `subscription-limits.service.ts`                             |
| Auth / lockout / reset          | `src/modules/auth/auth.service.ts`                                                                          |

**Invariants**

- Slot reservation stays inside the `Serializable` `$transaction` with
  `SELECT … FOR UPDATE` (`SchedulingRepository.lockOverlappingSlots`).
- Availability and conflict queries exclude `CANCELLED`, `NO_SHOW`, `COMPLETED` and
  `deletedAt IS NOT NULL`.
- Employee shifts in availability and reservation use the shared branch-local
  `workingWindowForInterval` helper. The separate calendar-day policy still differs:
  availability checks the local weekday, while create's `enforceBookingConstraints` uses
  `getUTCDay()`. Keep that distinction visible when changing booking policy.
- Wrap resource **create and restore** in `withResourceLimit()`: check and mutation use the
  same tenant-locked `ReadCommitted` transaction. `checkLimit()` alone is only a preview.
- Create and restore share the post-then-employee reservation path and bounded serialization
  retries. Check branch-local full-interval shift coverage, including DST, for both explicit
  and automatic employee assignment.
- Dispatch a domain event rather than calling audit/realtime/queues directly.

**Check**

```bash
pnpm test
pnpm test:e2e     # test/business-rules.e2e-spec.ts, test/scheduling-*.e2e-spec.ts, test/orders.e2e-spec.ts
```

**Update docs:** [business-logic.md](./business-logic.md), plus
[modules.md](./modules.md#5-change-impact-guide) if coupling changed.

---

## Recipe: add a dashboard feature

**Open**

```
frontend/src/features/<name>/api/<name>.api.ts
frontend/src/features/<name>/hooks/use<Name>.ts
frontend/src/features/<name>/pages/<Name>Page.tsx
frontend/src/app/router.tsx
frontend/src/app/layout/Sidebar.tsx
frontend/src/i18n/locales/{en,uk}/<namespace>.json  + frontend/src/i18n/index.ts
```

**Do**

1. `api/` holds raw `apiClient` calls and payload types. `hooks/` wraps them in TanStack Query
   with a stable `queryKey` and invalidations.
2. Add a lazy route in `router.tsx` wrapped in `SuspenseWrapper`.
3. Gate destructive/privileged actions with `<PermissionGate permission={PERMISSIONS.X.Y}>`.
4. Register any new i18n namespace in **three** places in `i18n/index.ts` (import, `en`, `uk`).

**Invariants**

- Do not add a per-mutation error toast — `QueryClient.defaultOptions.mutations.onError` already
  shows one.
- Paginated responses go through `toPaginated()`.
- `PermissionGate` is cosmetic; the backend is the authority.
- Never persist the access token; it lives in module memory only.
- Use the shared QueryClient. Account/access-scope changes clear query and mutation caches;
  stale HTTP/refresh results must fail the session-version check. Login/register invalidate
  the old generation before dispatch. All cookie writers run lazily in the shared serialized
  queue; keep their lease until the auth response is applied, including failure cleanup.
- Public booking selections belong to tenant/slug, branch, services and date. Clear them on
  context changes and revalidate after async form validation or availability updates.
  Confirmations use the public DTO,
  whose identity fields come from submitted data rather than historical CRM records.

**Check**

```bash
cd frontend && pnpm lint && pnpm test && pnpm build
```

**Update docs:** [frontend.md](./frontend.md), [features.md](./features.md).

---

## Recipe: change the public booking flow

**Open**

```
src/modules/public-booking/public-booking.service.ts        (*Internal methods — shared)
src/modules/public-booking/public-booking.controller.ts     (slug)
src/modules/public-booking/public-booking-header.controller.ts (widget)
src/modules/public-booking/dto/*.dto.ts
frontend/src/features/public-booking/**                     (the /public/:slug page)
frontend-booking/src/pages/BookingPage.tsx                  (the standalone widget)
frontend-booking/src/api/booking.api.ts
```

**Invariants**

- Both controllers delegate to the same `*Internal` methods — change the service once, then
  verify **both** routes.
- `allowOnlineBooking` is checked from resolved booking settings before anything is created.
- The widget's tenant contract is the `x-carwash-tenant-id` header; it must stay in
  `main.ts` CORS `allowedHeaders`.
- Bookings are created with `source: 'WEB'`, which yields
  `BOOKED_PENDING_CONFIRMATION` and schedules a 30-minute confirmation job.
- TOCTOU losses must surface as a friendly conflict, not a 500 — see the
  `catch` in `createBookingInternal`.

**Check**

```bash
pnpm test && pnpm test:e2e
cd frontend-booking && pnpm lint && pnpm build
```

**Update docs:** [business-logic.md](./business-logic.md#public-booking),
[frontend.md](./frontend.md#booking-widget-frontend-booking), [reference.md](./reference.md).

---

## Recipe: add a domain event, subscriber, or queue job

**Open**

```
src/common/events/event-types.ts                 (the EventType enum)
src/common/events/<area>-events.ts               (or src/modules/orders/events/)
src/modules/audit/audit.subscriber.ts
src/modules/realtime/realtime.subscriber.ts
src/modules/jobs/jobs.subscriber.ts
src/modules/jobs/producers/*.producer.ts
src/modules/jobs/processors/*.processor.ts
```

**Do**

1. Add the value to `EventType`, then a `DomainEvent` subclass with a typed `payload`.
2. Dispatch with `this.eventDispatcher.dispatch(new XEvent(tenantId, payload))`.
3. Add `@OnEvent(EventType.X)` in whichever subscriber should react.
4. For a new queue: `BullModule.registerQueue({ name })` in `JobsModule` **and** `HealthModule`
   (so `BullMQHealthIndicator` covers it), plus a producer and a `@Processor`.

**Invariants**

- Every `DomainEvent` needs `eventType`, `tenantId`, `payload`. System-level events use the
  literal `'system'` tenant.
- Subscribers must swallow their own errors (see `AuditSubscriber.log`) — a failing side effect
  must not fail the request.
- Jobs carry ids, not entities; processors re-read from the database.
- Adding a socket event means adding a listener in
  `frontend/src/shared/hooks/useSocket.ts` too.

**Check**

```bash
pnpm test
curl -s http://localhost:3000/api/v1/health | jq '.info.queues'
```

**Update docs:** [architecture.md](./architecture.md#4-async-lifecycle-events-subscribers-jobs),
[modules.md](./modules.md#events-and-jobs-wiring).

---

## Recipe: infrastructure / configuration change

**Open**

```
src/config/env.validation.ts
src/config/configuration.ts
.env.example  .env.docker.example
docker-compose.yml  docker-compose.dev.yml  docker-compose.prod.yml
Dockerfile  frontend/Dockerfile  frontend/nginx.conf
.github/workflows/ci.yml
```

**Invariants**

- Every new variable touches **six** places — the checklist is in
  [infrastructure.md](./infrastructure.md#adding-a-variable--the-full-checklist).
- `.env` / `.env.docker` stay gitignored. Examples carry placeholders, never values.
- Compose uses `${VAR:?…}` for anything that must not silently default in production.
- Migrations run at container start (`prisma migrate deploy`), not at build time.

**Check**

```bash
docker compose config
docker compose -f docker-compose.prod.yml config
pnpm exec tsc -p tsconfig.json --noEmit
```

**Update docs:** [infrastructure.md](./infrastructure.md), and
[../CONTRIBUTING.md](../CONTRIBUTING.md) if a script or the runbook changed.

---

## Focused repair verification

For real payment/reservation/quota races, use only the opt-in isolated PostgreSQL harness and
explicit `WASHFLOW_REPAIR_TEST_DATABASE_URL`; never application `DATABASE_URL`.
[CONTRIBUTING](../CONTRIBUTING.md#isolated-postgresql-concurrency-checks) describes strict URL
guards, new disposable database setup, actual lock-waiter checks, commands and cleanup.
The 15-migration chain has an empty schema diff. Run the concurrency suite against that
migration-built database. The separate guarded migration-upgrade suite checks synthetic
existing data, UTC conversion and atomic failure handling; the workflow also documents the
maintenance-window and historical-timezone checks needed before production deployment.

For public wizard context races, use each frontend's
`playwright.booking-selection.config.ts` against its already-started synthetic-test server
(dashboard 5179, widget 5180). Backend tests also verify the confirmation privacy contract for
both public routes and idempotent results.

---

## Useful search commands

```bash
# Every route: controller prefix + HTTP verbs
rg -n "@Controller\(|@(Get|Post|Patch|Put|Delete)\(" src --glob '!*.spec.ts'

# Public routes (class-level @Public() covers the whole controller)
rg -n "@Public\(\)" src --glob '!*.spec.ts'

# Permission strings actually required by routes
rg -o "@Permissions\('[^']+'" src --glob '!*.spec.ts' | sort -u

# Recount the headline numbers used in the docs
rg -o "export class \w+Controller" src --glob '!*.spec.ts' | wc -l   # controller classes
rg -n "^model " prisma/schema.prisma | wc -l                    # models
rg -n "^enum "  prisma/schema.prisma | wc -l                    # enums
rg -n "gen_random_uuid\(\), '" prisma/migrations/20260401000000_seed_permissions/migration.sql | wc -l   # permissions

# Who emits / consumes an event
rg -n "dispatch\(" src --glob '!*.spec.ts'
rg -n "@OnEvent" src --glob '!*.spec.ts'

# Where raw PrismaService is injected (tenant filter is manual there)
rg -ln "prisma: PrismaService" src --glob '!*.spec.ts'

# Frontend → backend endpoint usage
rg -n "apiClient\.(get|post|patch|put|delete)" frontend/src/features

# Nest module import edges
rg -n "imports: \[" src/modules/*/*.module.ts -A 6
```

---

## Documentation update matrix

| You changed…                                    | Update                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| A controller route, its auth or permission      | [reference.md](./reference.md) · [modules.md](./modules.md) · [features.md](./features.md) |
| `prisma/schema.prisma` or a migration           | [data-model.md](./data-model.md)                                                           |
| A Nest module's `imports`/`exports`             | [modules.md](./modules.md) (catalogue + graph)                                             |
| A guard, filter, interceptor, or middleware     | [architecture.md](./architecture.md)                                                       |
| An event, subscriber, queue, or cron            | [architecture.md](./architecture.md) · [modules.md](./modules.md)                          |
| A domain rule or invariant                      | [business-logic.md](./business-logic.md)                                                   |
| A frontend route, provider, or shared pattern   | [frontend.md](./frontend.md) · [features.md](./features.md)                                |
| The booking widget's tenant/build contract      | [frontend.md](./frontend.md) · [infrastructure.md](./infrastructure.md)                    |
| An env var, Compose file, Dockerfile, or CI job | [infrastructure.md](./infrastructure.md) · [../CONTRIBUTING.md](../CONTRIBUTING.md)        |
| A `package.json` script                         | [../CONTRIBUTING.md](../CONTRIBUTING.md) · this file                                       |
| Anything user-visible or architectural          | [../../OVERVIEW.md](../../OVERVIEW.md) (the standing project rule)                         |
| Quick-start steps, ports, or demo credentials   | [../../README.md](../../README.md) · [infrastructure.md](./infrastructure.md)              |

**Standing rule for this repository:** after any business-logic or feature change, update
`OVERVIEW.md` **and** the specific `docs/context/*` page from the table above. Do not duplicate
detail into `OVERVIEW.md` — link to the context doc instead.

---

## Things that will bite you

1. `pnpm lint` (root) **auto-fixes**. Use `pnpm exec eslint …` for a read-only check.
2. Backend default port is `3000`, but both Vite proxies and the CI Playwright job use `3003`.
3. `TenantPrismaService` does **not** cover `Tenant`, `SubscriptionAddon`, `PasswordResetToken`,
   or any transaction client — the tenant filter there is manual.
4. Unique indexes are **not** partial: a soft-deleted user keeps its email.
5. `@Throttle({ default: … })` in the public-booking controllers does not match any registered
   throttler name (`short` / `long`). Verify effective limits before relying on them.
6. `docker-entrypoint.sh` is unreferenced and points at `dist/src/main.js`, while the Dockerfile
   runs `dist/main.js`.
7. `frontend-booking/` has no Docker image and no CI job.
8. Three lockfiles. Install in the right directory.
9. `NODE_ENV=test` disables rate limiting (`ThrottlerModule.forRoot([])`).
10. Swagger (`/api/docs`) is served only when `NODE_ENV !== 'production'`.

---

Related: [README.md](./README.md) · [modules.md](./modules.md) ·
[infrastructure.md](./infrastructure.md) · [../CONTRIBUTING.md](../CONTRIBUTING.md)
