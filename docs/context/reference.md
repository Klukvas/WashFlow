# API & Seed Reference

Verified inventory of every HTTP route, read from `@Controller` / `@Get` / `@Post` / `@Patch` /
`@Put` / `@Delete` decorators in `src/`, plus the demo data produced by `prisma/seed.ts`.

**Entry point:** [README.md](./README.md) · **Module ownership:** [modules.md](./modules.md) ·
**Env vars:** [infrastructure.md](./infrastructure.md#3-environment-variables) ·
**Schema:** [data-model.md](./data-model.md)

---

## Conventions

- Global prefix **`/api/v1`** — every path below is relative to it.
- Every route requires a Bearer access token unless marked **Public**.
- **Perm** = the string in `@Permissions(...)`. `isSuperAdmin` bypasses all of them.
  Routes with a blank Perm still require a valid JWT.
- **Rate** shows a route-level `@Throttle` override; otherwise the global `short` (10/1 s) and
  `long` (100/60 s) throttlers apply. `NODE_ENV=test` disables throttling entirely.
- Successful responses are wrapped by `TransformInterceptor` — see
  [architecture.md](./architecture.md#response-envelope).
- List endpoints extend `PaginationDto`: `page` (≥1, default 1), `limit` (1–100, default 20),
  `sortBy` (allow-listed), `sortOrder` (`asc`/`desc`, default `asc`), `includeDeleted`.

**Totals: 24 controller classes, 113 routes, 17 of them `@Public()`.**

| Area           |  Routes | Public |
| -------------- | ------: | -----: |
| auth           |       7 |      5 |
| tenants        |       4 |      0 |
| users          |       7 |      0 |
| roles          |       7 |      0 |
| permissions    |       2 |      0 |
| branches       |       8 |      0 |
| work-posts     |       6 |      0 |
| services       |       6 |      0 |
| clients        |       7 |      0 |
| vehicles       |       7 |      0 |
| workforce      |       5 |      0 |
| orders         |       7 |      0 |
| payments       |       2 |      0 |
| analytics      |      11 |      0 |
| audit          |       1 |      0 |
| subscriptions  |      14 |      0 |
| paddle webhook |       1 |      1 |
| public booking |       8 |      8 |
| support        |       1 |      1 |
| health         |       1 |      1 |
| metrics        |       1 |      1 |
| **Total**      | **113** | **17** |

---

## Auth — `AuthController` (`/auth`)

| Method | Path                    | Auth   | Status | Rate   | Notes                                                              |
| ------ | ----------------------- | ------ | ------ | ------ | ------------------------------------------------------------------ |
| POST   | `/auth/login`           | Public | 200    | 5/min  | Returns access token + user; sets the `refresh_token` cookie       |
| POST   | `/auth/register`        | Public | 201    | 3/min  | Creates tenant + Admin role + user + 30-day trial; auto-login      |
| POST   | `/auth/refresh`         | Public | 200    | 10/min | Reads the refresh token **from the cookie** — no request body      |
| POST   | `/auth/logout`          | JWT    | 204    | —      | Increments `tokenVersion`, clears the cookie                       |
| PATCH  | `/auth/change-password` | JWT    | 204    | —      | Verifies the current password; rejects reuse; bumps `tokenVersion` |
| POST   | `/auth/forgot-password` | Public | 200    | 3/min  | Always returns the same message                                    |
| POST   | `/auth/reset-password`  | Public | 200    | 5/min  | Token is matched by SHA-256 hash; invalidates all sessions         |

The refresh cookie is `httpOnly`, `sameSite: strict`, `path=/api/v1/auth`, `secure` in
production, `maxAge` 7 days.

## Tenants — `TenantsController` (`/tenants`)

| Method | Path           | Guard / Perm           | Notes                                                      |
| ------ | -------------- | ---------------------- | ---------------------------------------------------------- |
| GET    | `/tenants`     | `SuperAdminGuard`      | All tenants                                                |
| GET    | `/tenants/:id` | `tenants.read`         | Non-super-admins may only read their own tenant (403 else) |
| POST   | `/tenants`     | `SuperAdminGuard`, 201 |                                                            |
| PATCH  | `/tenants/:id` | `tenants.update`       |                                                            |

No delete and no restore.

## Users — `UsersController` (`/users`)

| Method | Path                        | Perm           | Notes                                     |
| ------ | --------------------------- | -------------- | ----------------------------------------- |
| GET    | `/users`                    | `users.read`   | Paginated, branch-scoped                  |
| GET    | `/users/:id`                | `users.read`   |                                           |
| POST   | `/users`                    | `users.create` | Subscription limit checked                |
| PATCH  | `/users/:id`                | `users.update` | Role and branch validated against tenant  |
| PATCH  | `/users/:id/reset-password` | `users.update` | 204; admin resets another user's password |
| DELETE | `/users/:id`                | `users.delete` | Soft delete                               |
| PATCH  | `/users/:id/restore`        | `users.update` | Re-checks the subscription limit          |

## Roles — `RolesController` (`/roles`)

| Method | Path                     | Perm           |
| ------ | ------------------------ | -------------- |
| GET    | `/roles`                 | `roles.read`   |
| GET    | `/roles/:id`             | `roles.read`   |
| POST   | `/roles`                 | `roles.create` |
| PATCH  | `/roles/:id`             | `roles.update` |
| DELETE | `/roles/:id`             | `roles.delete` |
| PATCH  | `/roles/:id/restore`     | `roles.update` |
| POST   | `/roles/:id/permissions` | `roles.update` |

## Permissions — `PermissionsController` (`/permissions`)

| Method | Path                   | Perm         | Notes                            |
| ------ | ---------------------- | ------------ | -------------------------------- |
| GET    | `/permissions`         | `roles.read` | Whole global catalogue (47 rows) |
| GET    | `/permissions/:module` | `roles.read` | Filtered by module name          |

All 47 seeded permissions are mirrored in `frontend/src/shared/constants/permissions.ts`, but
only **43 distinct strings** actually appear in a `@Permissions(...)` decorator. Four are
seeded and assignable yet gate nothing today: `payments.update`, `payments.delete`,
`tenants.create`, `tenants.delete` (tenant create/delete are guarded by `SuperAdminGuard`
instead, and there is no tenant delete route at all).

## Branches — `BranchesController` (`/branches`)

| Method | Path                             | Perm              |
| ------ | -------------------------------- | ----------------- |
| GET    | `/branches`                      | `branches.read`   |
| GET    | `/branches/:id`                  | `branches.read`   |
| POST   | `/branches`                      | `branches.create` |
| PATCH  | `/branches/:id`                  | `branches.update` |
| DELETE | `/branches/:id`                  | `branches.delete` |
| PATCH  | `/branches/:id/restore`          | `branches.update` |
| GET    | `/branches/:id/booking-settings` | `branches.read`   |
| PATCH  | `/branches/:id/booking-settings` | `branches.update` |

## Work posts — `WorkPostsController` (`/work-posts`)

| Method | Path                      | Perm                | Notes                                                |
| ------ | ------------------------- | ------------------- | ---------------------------------------------------- |
| GET    | `/work-posts`             | `work-posts.read`   | Optional `?branchId`; branch-scoped users are pinned |
| GET    | `/work-posts/:id`         | `work-posts.read`   |                                                      |
| POST   | `/work-posts`             | `work-posts.create` | Subscription limit checked                           |
| PATCH  | `/work-posts/:id`         | `work-posts.update` |                                                      |
| DELETE | `/work-posts/:id`         | `work-posts.delete` | **204**, soft delete                                 |
| PATCH  | `/work-posts/:id/restore` | `work-posts.update` |                                                      |

## Services — `ServicesController` (`/services`)

| Method | Path                    | Perm              |
| ------ | ----------------------- | ----------------- |
| GET    | `/services`             | `services.read`   |
| GET    | `/services/:id`         | `services.read`   |
| POST   | `/services`             | `services.create` |
| PATCH  | `/services/:id`         | `services.update` |
| DELETE | `/services/:id`         | `services.delete` |
| PATCH  | `/services/:id/restore` | `services.update` |

## Clients — `ClientsController` (`/clients`)

| Method | Path                   | Perm             | Notes                              |
| ------ | ---------------------- | ---------------- | ---------------------------------- |
| POST   | `/clients/merge`       | `clients.update` | Declared **before** `/clients/:id` |
| GET    | `/clients`             | `clients.read`   | `?search=` over name and phone     |
| GET    | `/clients/:id`         | `clients.read`   |                                    |
| POST   | `/clients`             | `clients.create` |                                    |
| PATCH  | `/clients/:id`         | `clients.update` |                                    |
| DELETE | `/clients/:id`         | `clients.delete` | Emits `client.deleted`             |
| PATCH  | `/clients/:id/restore` | `clients.update` |                                    |

## Vehicles — `VehiclesController` (`/vehicles`)

| Method | Path                    | Perm              | Notes                                                                                                                                                                     |
| ------ | ----------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/vehicles`             | `vehicles.read`   | `VehicleQueryDto` (e.g. filter by client)                                                                                                                                 |
| GET    | `/vehicles/:id`         | `vehicles.read`   |                                                                                                                                                                           |
| POST   | `/vehicles`             | `vehicles.create` |                                                                                                                                                                           |
| PATCH  | `/vehicles/:id`         | `vehicles.update` |                                                                                                                                                                           |
| DELETE | `/vehicles/:id`         | `vehicles.delete` |                                                                                                                                                                           |
| PATCH  | `/vehicles/:id/restore` | `vehicles.update` |                                                                                                                                                                           |
| POST   | `/vehicles/:id/photo`   | `vehicles.update` | `multipart/form-data`, field `file`; ≤5 MB; mimetype `image/*` **and** extension in `.jpg .jpeg .png .webp .gif`; stored under `./uploads/vehicles`, served at `/uploads` |

## Workforce — `EmployeeProfileController` (`/workforce/profiles`)

| Method | Path                      | Perm               |
| ------ | ------------------------- | ------------------ |
| GET    | `/workforce/profiles`     | `workforce.read`   |
| GET    | `/workforce/profiles/:id` | `workforce.read`   |
| POST   | `/workforce/profiles`     | `workforce.create` |
| PATCH  | `/workforce/profiles/:id` | `workforce.update` |
| DELETE | `/workforce/profiles/:id` | `workforce.delete` |

No restore route.

## Orders — `OrdersController` (`/orders`)

| Method | Path                   | Perm              | Notes                                                                                                          |
| ------ | ---------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------- |
| GET    | `/orders`              | `orders.read`     | `OrderQueryDto`: `status`, `branchId`, `clientId`, `dateFrom`, `dateTo` + pagination                           |
| GET    | `/orders/availability` | `scheduling.read` | Query: `branchId` (UUID, required), `date`, `durationMinutes` (default 30), `workPostId`, `assignedEmployeeId` |
| GET    | `/orders/:id`          | `orders.read`     |                                                                                                                |
| POST   | `/orders`              | `orders.create`   | **201**; honours the `idempotency-key` header (service-level idempotency)                                      |
| PATCH  | `/orders/:id/status`   | `orders.update`   | Validated against the state machine                                                                            |
| DELETE | `/orders/:id`          | `orders.delete`   | Soft delete                                                                                                    |
| PATCH  | `/orders/:id/restore`  | `orders.update`   | Re-validates scheduling conflicts for non-terminal orders                                                      |

`/orders/availability` is declared before `/orders/:id` so it is not swallowed by the param route.
Order detail/status/delete/restore apply the authenticated user's branch scope as well as
its tenant. Create/restore validate active same-tenant/same-branch resource assignments and
reserve the post before the employee within the transaction.

## Payments — `PaymentsController` (`/orders/:orderId/payments`)

| Method | Path                        | Perm              | Rate  | Notes                                                    |
| ------ | --------------------------- | ----------------- | ----- | -------------------------------------------------------- |
| GET    | `/orders/:orderId/payments` | `payments.read`   | —     |                                                          |
| POST   | `/orders/:orderId/payments` | `payments.create` | 5/min | Uses `IdempotencyInterceptor` (`idempotency-key` header) |

Payment creation locks the tenant-scoped order and performs Decimal sum/limit validation
and insertion in one `ReadCommitted` transaction. Overpayment is a business `400`, including
concurrent requests. The HTTP idempotency header does not replace this lock.

## Analytics — `AnalyticsController` (`/analytics`)

All require `analytics.view`. Common query params: `dateFrom`, `dateTo`, optional `branchId`.

| Path                        | Returns                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `/analytics/dashboard`      | Summary: orders, revenue, clients, completion rate                                      |
| `/analytics/revenue`        | Revenue over the date range                                                             |
| `/analytics/services`       | Most popular services by order count                                                    |
| `/analytics/kpi`            | Today's KPIs: revenue, orders, average duration, cancel rate, active clients, occupancy |
| `/analytics/live`           | Live operations: in-progress, waiting, free posts, overdue                              |
| `/analytics/branches`       | Per-branch revenue, orders, average check, load rate                                    |
| `/analytics/employees`      | Per-employee orders, revenue, cancel rate                                               |
| `/analytics/alerts`         | Anomalies: high cancel rate, revenue drop, booking decline                              |
| `/analytics/online-booking` | Order-source breakdown (`INTERNAL`/`WEB`/`WIDGET`/`API`)                                |
| `/analytics/export/orders`  | CSV of orders (streamed)                                                                |
| `/analytics/export/clients` | CSV of clients (streamed)                                                               |

The two export routes have no caller in the operator dashboard.

## Audit — `AuditController` (`/audit-logs`)

| Method | Path          | Perm         | Notes                                             |
| ------ | ------------- | ------------ | ------------------------------------------------- |
| GET    | `/audit-logs` | `audit.read` | `AuditQueryDto` filters; branch-scoped; paginated |

## Subscriptions

### `SubscriptionStatusController` (`/subscription`)

| Method | Path                   | Perm | Notes                                                                                                    |
| ------ | ---------------------- | ---- | -------------------------------------------------------------------------------------------------------- |
| GET    | `/subscription/status` | —    | JWT only, no permission. Returns `{ isTrial, trialEndsAt, paymentsEnabled }` for the frontend trial gate |

### `SubscriptionUsageController` (`/subscription`) — `PermissionsGuard`

| Method | Path                         | Perm             | Extra guard            | Status |
| ------ | ---------------------------- | ---------------- | ---------------------- | ------ |
| GET    | `/subscription/usage`        | `tenants.read`   | —                      | 200    |
| GET    | `/subscription/billing`      | `tenants.read`   | —                      | 200    |
| GET    | `/subscription/transactions` | `tenants.read`   | —                      | 200    |
| GET    | `/subscription/plans`        | `tenants.read`   | —                      | 200    |
| POST   | `/subscription/checkout`     | `tenants.update` | `PaymentsEnabledGuard` | 200    |
| POST   | `/subscription/change-plan`  | `tenants.update` | `PaymentsEnabledGuard` | 200    |
| POST   | `/subscription/addons`       | `tenants.update` | `PaymentsEnabledGuard` | 200    |
| POST   | `/subscription/preview`      | `tenants.read`   | —                      | 200    |
| POST   | `/subscription/cancel`       | `tenants.update` | `PaymentsEnabledGuard` | 200    |
| POST   | `/subscription/reactivate`   | `tenants.update` | `PaymentsEnabledGuard` | 200    |

`PaymentsEnabledGuard` returns **503** when `PAYMENTS_ENABLED` is not `true`. Payments default
to false, including production Compose; explicitly enabling them requires all three nonblank
Paddle credentials at startup, in every environment.

### `SubscriptionAdminController` (`/tenants/:tenantId/subscription`) — `SuperAdminGuard`

| Method | Path                              | Status |
| ------ | --------------------------------- | ------ |
| GET    | `/tenants/:tenantId/subscription` | 200    |
| PUT    | `/tenants/:tenantId/subscription` | 200    |
| DELETE | `/tenants/:tenantId/subscription` | 204    |

### `PaddleWebhookController`

| Method | Path               | Auth   | Status | Notes                                                                                                       |
| ------ | ------------------ | ------ | ------ | ----------------------------------------------------------------------------------------------------------- |
| POST   | `/webhooks/paddle` | Public | 200    | `@SkipThrottle()`. Requires `Paddle-Signature` + raw body; HMAC-SHA256 verified; Redis `SET NX` idempotency |

## Support — `SupportController` (`/support`)

| Method | Path       | Auth   | Rate  | Notes                                                                          |
| ------ | ---------- | ------ | ----- | ------------------------------------------------------------------------------ |
| POST   | `/support` | Public | 3/min | Body: `subject`, `message`, optional `email`. Works authenticated or anonymous |

## Public booking

### Slug-based — `PublicBookingController` (`/public/booking`), whole controller `@Public()`

| Method | Path                                       | Declared rate | Notes                                |
| ------ | ------------------------------------------ | ------------- | ------------------------------------ |
| GET    | `/public/booking/:tenantSlug/availability` | 20/min        | Slug format validated before lookup  |
| GET    | `/public/booking/:tenantSlug/services`     | 20/min        | Active services only                 |
| GET    | `/public/booking/:tenantSlug/branches`     | 20/min        | Active branches only                 |
| POST   | `/public/booking/:tenantSlug/book`         | 5/min         | Honours the `idempotency-key` header |

Both `book` endpoints return an explicit `BookingConfirmationDto` inside the normal response
envelope: `id`, `branchId`, ISO `scheduledStart` / `scheduledEnd`, numeric `totalPrice`, public
branch `id/name/address/phone`, service line snapshots, and submitted client/vehicle display
fields. `client` has only `firstName`, nullable `lastName`, `phone`; `vehicle` has only
`licensePlate`, nullable `make` / `model`. Those identity fields are echoed from the current
request even when CRM records match a phone/plate. Stored email/notes, client/vehicle ids,
staff data, tenant ids and full relations are excluded, including on idempotency replay.

### Header-based — `PublicBookingHeaderController` (`/public/widget`), whole controller `@Public()`

| Method | Path                          | Declared rate | Notes                                 |
| ------ | ----------------------------- | ------------- | ------------------------------------- |
| GET    | `/public/widget/services`     | 20/min        | Requires `x-carwash-tenant-id` (UUID) |
| GET    | `/public/widget/branches`     | 20/min        |                                       |
| GET    | `/public/widget/availability` | 20/min        |                                       |
| POST   | `/public/widget/book`         | 5/min         | Honours the `idempotency-key` header  |

> These eight routes declare `@Throttle({ default: … })`, but the application registers only
> `short` and `long` throttlers. Treat the numbers above as _declared_, not verified-effective —
> see [architecture.md](./architecture.md#guards-in-order).

## Operational

| Method | Path       | Auth                        | Notes                                                                          |
| ------ | ---------- | --------------------------- | ------------------------------------------------------------------------------ |
| GET    | `/health`  | Public                      | Terminus: `database` (Prisma ping), `redis`, `queues` (3 BullMQ queues)        |
| GET    | `/metrics` | Public + `MetricsAuthGuard` | `@SkipThrottle()`. Bearer `METRICS_TOKEN`; **denied in production when unset** |

Swagger UI is mounted at **`/api/docs`** (not under the `api/v1` prefix) and only when
`NODE_ENV !== 'production'`.

---

## WebSocket

Namespace **`/events`**.

| Aspect                            | Detail                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| Handshake                         | `auth.token` or `Authorization: Bearer <access token>`; non-`access` tokens are rejected |
| Rooms                             | Auto-join `tenant:{tenantId}`; server-side emits may target `branch:{branchId}`          |
| Server → client                   | `order.created`, `order.status_changed`, `order.cancelled`                               |
| Client listeners in the dashboard | the three above plus `payment.received` and `booking.confirmed` (no backend emitter yet) |
| Expiry                            | A 60 s sweep disconnects clients whose access token has expired                          |
| CORS                              | From `CORS_ORIGINS`; empty/`*` means allow-all in dev and **deny** in production         |

---

## Standard headers

| Header                  | Direction | Used by                                                                     |
| ----------------------- | --------- | --------------------------------------------------------------------------- |
| `Authorization`         | in        | Bearer access token; also the `/metrics` token                              |
| `Cookie: refresh_token` | in        | `POST /auth/refresh`, `POST /auth/logout` (httpOnly, set by the server)     |
| `idempotency-key`       | in        | `POST /orders`, `POST /orders/:id/payments`, both public `book` routes      |
| `x-carwash-tenant-id`   | in        | `/public/widget/*` — tenant UUID                                            |
| `x-tenant-id`           | in        | Super-admin tenant override (validated UUID, must exist)                    |
| `Paddle-Signature`      | in        | `POST /webhooks/paddle`                                                     |
| `x-correlation-id`      | in/out    | Echoed or generated by `CorrelationIdMiddleware`; appears in every log line |

All of `Content-Type`, `Authorization`, `x-carwash-tenant-id` and `idempotency-key` are in the
CORS `allowedHeaders` list in `src/main.ts`.

---

## Seed data — `prisma/seed.ts`

`npx prisma db seed` (or `pnpm seed`). Idempotent: it upserts the demo tenant and skips work that
already exists. Generates roughly one year of operations.

| Entity          | Volume | Detail                                                                                                                                                                 |
| --------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant          | 1      | `WashFlow Demo`, slug `demo`, fixed id `00000000-0000-4000-8000-000000000001`                                                                                          |
| Permissions     | 47     | `module.action` across 14 modules (also created by migration `20260401000000`)                                                                                         |
| BookingSettings | 1 + 3  | One tenant-level row plus one per branch (07:00–21:00/15 min, 08:00–20:00/15 min, 09:00–19:00/20 min; buffer 10 min, `maxAdvanceBookingDays` 30, `workingDays [1..6]`) |
| Branches        | 3      | Центральний філіал (4 posts), Лівобережний філіал (3), Подільський філіал (4) — Kyiv addresses                                                                         |
| Work posts      | 11     | `Пост 1..n` per branch                                                                                                                                                 |
| Services        | 8      | Express wash → ceramic coating                                                                                                                                         |
| Roles           | 4      | `Admin` (all permissions) plus three Ukrainian-named staff roles: `Менеджер`, `Оператор`, `Рецепціоніст`                                                               |
| Staff users     | 18     | Transliterated Ukrainian names; first per branch is Manager, rest Operator/Receptionist                                                                                |
| Clients         | 250    | Ukrainian names and phone numbers                                                                                                                                      |
| Vehicles        | ~400   | 1–3 per client                                                                                                                                                         |
| Orders          | ~2,500 | Day-by-day slot filling with per-post cursors, so no conflicts are generated                                                                                           |
| Payments        | ~1,800 | For completed orders                                                                                                                                                   |
| Audit logs      | ~4,800 | CREATE and STATUS_CHANGE entries                                                                                                                                       |

Order generation spans `today − 1 year → today`, applies monthly seasonal weights
(`SEASONAL_WEIGHTS`) on top of `BASE_ORDERS_PER_BRANCH`, and mixes statuses and sources.

### Demo credentials

These are seeded demo values, already published in `README.md` and `OVERVIEW.md`.

| Account     | Email                 | Password      | Notes                                                |
| ----------- | --------------------- | ------------- | ---------------------------------------------------- |
| Super admin | `admin@washflow.com`  | `admin123`    | `isSuperAdmin: true`                                 |
| Staff       | `<name>@washflow.com` | `password123` | Role-scoped; e.g. `oleksandr.marchenko@washflow.com` |

Email is globally unique, so the login form needs no tenant selector.

```sql
-- List seeded staff with their role and branch
SELECT u.email, r.name AS role, b.name AS branch
FROM users u
LEFT JOIN roles r ON u."roleId" = r.id
LEFT JOIN branches b ON u."branchId" = b.id
WHERE u."isSuperAdmin" = false
ORDER BY b.name, r.name;
```

Playwright reads its login from `frontend/.env.test`, which defines `PLAYWRIGHT_EMAIL`,
`PLAYWRIGHT_PASSWORD` and `PLAYWRIGHT_TENANT_ID`. **That file is gitignored**
(`frontend/.gitignore`), so create it locally before running the E2E suite.

---

Related: [modules.md](./modules.md) · [business-logic.md](./business-logic.md) ·
[frontend.md](./frontend.md) · [data-model.md](./data-model.md)
