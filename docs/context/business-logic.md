# Business Logic

The domain invariants that make WashFlow correct. Enforced in the **service and data layers** —
the UI mirrors them but is never the authority.

**Read this when** you are changing a rule, not just plumbing.
**Entry point:** [README.md](./README.md) · **Where the code lives:** [modules.md](./modules.md) ·
**Schema facts:** [data-model.md](./data-model.md)

---

## Multi-tenancy and data isolation

- Every tenant-owned table carries a `tenantId` column. `TenantPrismaService.forTenant(tenantId)`
  auto-injects it into reads and writes and auto-filters `deletedAt: null` for the nine
  soft-delete models.
- `@CurrentTenant()` reads `tenantId` from the JWT and throws `403` when absent.
- The global `TenantGuard` requires an authenticated user with a tenant, and lets a
  **super admin** switch tenant with an `x-tenant-id` header — validated as a UUID and checked
  against an existing tenant, then recorded as an `auth.superadmin_tenant_access` audit entry.
- **Exceptions you must know** (full detail in
  [architecture.md](./architecture.md#5-tenant-isolation-and-its-exceptions)):
  - `Permission`, `RolePermission`, `IdempotencyKey` bypass injection by name.
  - `Tenant`, `Subscription`, `SubscriptionAddon`, `PasswordResetToken`, `BookingSettings` are
    accessed through raw `PrismaService` with explicit filters.
  - Any `$transaction` callback receives a **plain** Prisma client — the extension does not
    apply, so every `where` inside a transaction needs an explicit `tenantId`.
- Branch-level scoping is separate: `@CurrentBranch()` yields the user's `branchId` (or `null`
  for unscoped users), and `applyBranchScope()` merges it into a `where` clause. Order detail,
  status, delete and restore honor this scope. Booking settings resolve a branch override by
  the compound `(tenantId, branchId)` key. Order reservation validates active parent/resources
  in that tenant and branch; work-post creation also validates its active parent branch.

---

## Authentication and RBAC

| Rule              | Implementation                                                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password hashing  | argon2 (`argon2.hash` / `argon2.verify`)                                                                                                                                                          |
| Access token      | JWT, `JWT_ACCESS_EXPIRATION` (default `15m`), sent as `Authorization: Bearer`                                                                                                                     |
| Refresh token     | JWT, `JWT_REFRESH_EXPIRATION` (default `7d`), delivered as an httpOnly cookie `refresh_token` scoped to `/api/v1/auth`, `sameSite: strict`, `secure` in production, `maxAge` hard-coded to 7 days |
| Revocation        | `User.tokenVersion`; `refreshTokens()` rejects a token whose `tokenVersion` no longer matches                                                                                                     |
| Global protection | `JwtAuthGuard` as `APP_GUARD`; `@Public()` opts out                                                                                                                                               |
| Permissions       | `@Permissions('module.action')` + `PermissionsGuard`; **47** permissions across **14** modules                                                                                                    |
| Super admin       | `isSuperAdmin: true` bypasses `PermissionsGuard` and may switch tenants                                                                                                                           |
| Rate limiting     | `short` 10 req/1 s, `long` 100 req/60 s; tracked per user id when authenticated, else per IP                                                                                                      |

**JWT payload** (`src/common/types/jwt-payload.type.ts`): `sub`, `tenantId`, `branchId`, `email`,
`isSuperAdmin`, `permissions[]`, `tokenVersion`, `type: 'access' | 'refresh'`.
Permissions are embedded in the token, so **a role change only takes effect after the next
token refresh**.

If a user's role is soft-deleted, `login` resolves `permissions` to an empty array.

### Account lockout

`MAX_FAILED_ATTEMPTS = 5`, `LOCKOUT_DURATION_MS = 30 min` (`src/modules/auth/auth.service.ts`).
On the 5th consecutive failure `accountLockedUntil` is set and `auth.account_locked` is
dispatched. A successful login resets `failedLoginAttempts` and clears the lock. While locked,
login returns `401 Account is temporarily locked. Please try again later.`

Login is also hardened against user enumeration: an unknown email still runs an argon2 verify
against a pre-computed `DUMMY_PASSWORD_HASH`, and both branches return the same
`Invalid credentials` message.

### Password reset

1. `POST /auth/forgot-password` — returns `{ message: 'If the email exists, a reset link has been sent' }`
   **unconditionally**. It silently returns early when the user is missing, inactive, soft-deleted,
   or the tenant does not exist.
2. A 32-byte random token is generated. **Only the SHA-256 hash is stored** in
   `password_reset_tokens.token`; the raw token goes into the emailed link
   (`${FRONTEND_URL}/reset-password?token=<raw>`). Expiry: 1 hour.
3. All previous unused tokens for that user are marked `usedAt` first.
4. `POST /auth/reset-password` hashes the supplied token, rejects missing/used/expired tokens
   with `400 Invalid or expired reset token`, then in one `$transaction` updates the password,
   increments `tokenVersion` (invalidating every outstanding session) and marks the token used.

`PATCH /auth/change-password` verifies the current password, rejects reusing the same password,
and also increments `tokenVersion`.

### Self-registration

`POST /auth/register` (public, 3/min) creates, in a single `$transaction`: a `Tenant` with a
generated unique slug, an `Admin` `Role` granted every `Permission`, the first `User`, and a
30-day trial `Subscription`. It returns tokens immediately (auto-login).

---

## Scheduling engine

`src/modules/scheduling/scheduling.service.ts` + `scheduling.repository.ts`.

### Availability (`GET /orders/availability`, public booking)

1. Resolve booking settings: **branch row → tenant row (`branchId: null`) → hard-coded
   defaults** (`src/common/utils/booking-settings.util.ts`).
2. Verify the branch belongs to the tenant (`404` otherwise) and read its `timezone`.
3. **Working-day check** — the local day-of-week is derived with `Intl.DateTimeFormat` in the
   branch timezone; a non-working day returns `[]`.
4. **Advance-booking check** — a date beyond `maxAdvanceBookingDays` returns `[]`.
5. Working hours are converted from branch-local to UTC with `fromZonedTime`.
6. Orders for all work posts in the day range are fetched in **one** query and grouped in
   memory (no N+1).
7. Per work post, a slot is unavailable when an existing order overlaps
   `[slotStart − buffer, slotEnd + buffer)`. Orders in `CANCELLED`, `NO_SHOW`, `COMPLETED` or
   soft-deleted are ignored — completing an order therefore frees its slot.
8. **Workforce cap**: when the branch has at least one employee profile, per-slot employee
   availability is computed from two batched queries and
   `EffectiveCapacity = min(freeWorkPosts, availableEmployees)`.
9. **Zero-profile fallback**: a branch with no profiles is capped by work posts only — exactly
   the pre-workforce behaviour.

Employee availability requires `isWorker`, `active`, non-null `workStartTime`/`workEndTime`
covering the slot, an active non-deleted user and branch, and no overlapping active order
(buffer included). Availability and reservation share `workingWindowForInterval`: shift checks
use the branch timezone across the entire half-open interval, including both sides of a DST
transition. Seconds round the required end up to the next minute; cross-local-day intervals are
rejected because profiles describe same-day shifts.

### Reservation (order creation and restore)

`runReservationTransaction` runs the whole reservation in a `Serializable` `$transaction`
with a 10 s timeout and at most three total attempts. It retries `P2034` and raw-query
`P2010` only when the PostgreSQL adapter cause identifies `TransactionWriteConflict` or
SQLSTATE `40001` / `40P01`. Other raw SQL failures escape unchanged. Persistent contention
returns a friendly `409`; other errors retain their business status.
Create and non-terminal restore use the same resource reservation path: validate the active
branch/post, lock the stable work-post row first, then check overlapping orders:

```sql
SELECT id FROM orders
WHERE "tenantId" = $1 AND "workPostId" = $2
  AND status NOT IN ('CANCELLED','NO_SHOW','COMPLETED')
  AND "scheduledStart" < $end AND "scheduledEnd" > $start
  AND "deletedAt" IS NULL
FOR UPDATE
```

`SchedulingRepository.lockWorkPost` protects an empty slot as well as an occupied one;
`lockOverlappingSlots` and `countOverlapping` decide conflicts. The employee row is locked
only after the work post, then eligibility is rechecked with explicit tenant, branch, active
and soft-delete filters. This also serializes the same employee on different posts. A losing
request gets the relevant business rejection (slot `409`, employee unavailable `400`), rather
than a raw database serialization error. Side effects run only after a successful commit.

When no `workPostId` is supplied, `OrdersService.resolveWorkPost` walks the branch's active work
posts and takes the first that reserves successfully, swallowing `ConflictException` and
rethrowing anything else. If none is free: `400 No available work posts for the requested time`.

---

## Workforce layer

`EmployeeProfile` is an **operational** record, deliberately independent of `User`/`Role`/RBAC.

- One profile per user (`userId @unique`, tenant-wide), tied to a `branchId`.
- `isWorker` marks someone as schedulable; `active` toggles them without deleting;
  `workStartTime` / `workEndTime` are `"HH:MM"` strings defining the daily window.
- `efficiencyCoefficient` is stored but not yet used in capacity math.
- **Auto-assignment** (`reserveEmployee` in `orders/employee-eligibility.util.ts`): when the caller does not pass
  `assignedEmployeeId` and the branch has ≥1 profile with a `workStartTime`, the first employee
  whose window covers the order and who has no overlapping active order (buffer included) is
  assigned. If none qualifies: `400 No available employees for the requested time`.
  With **zero** profiles, `assignedEmployeeId` stays `undefined` and nothing is blocked.
- Assignment happens **inside** the same `Serializable` transaction that reserves the work post,
  eliminating the check-then-act race.
- Explicit and automatic employee assignment share the same eligibility predicate and
  branch-local shift helper as availability, including DST boundaries. Inactive/deleted users,
  employees or branches cannot supply booking capacity.
- `DELETE /workforce/profiles/:id` requires the profile to be inactive first.

---

## Order lifecycle

State machine — `src/modules/orders/types/order.types.ts`:

```
BOOKED_PENDING_CONFIRMATION → BOOKED, CANCELLED, NO_SHOW
BOOKED                      → IN_PROGRESS, CANCELLED, NO_SHOW
IN_PROGRESS                 → COMPLETED, CANCELLED
COMPLETED                   → (terminal)
CANCELLED                   → (terminal)
NO_SHOW                     → (terminal)
```

### Creation — `OrdersService.create`, in order

1. `validateBranchScope` — a branch-scoped user may only create in their own branch.
2. At least one `serviceId` is required.
3. `scheduledStart` may not be in the past.
4. Client **and** vehicle must belong to the tenant (`validateClientVehicleOwnership`).
5. Explicit branch/post/employee resources must be eligible in the tenant and selected branch;
   final checks happen while reserving resources inside the transaction.
6. Price and duration are summed from the selected services;
   `scheduledEnd = scheduledStart + totalDuration`.
7. Booking settings are resolved; `enforceBookingConstraints` rejects non-working days
   (`getUTCDay()`) and dates beyond `maxAdvanceBookingDays`.
8. `status` is `BOOKED_PENDING_CONFIRMATION` when `source === 'WEB'`, otherwise `BOOKED`.
9. `Serializable` transaction: idempotency check/lock → work-post reservation → employee
   assignment → `order.create` with nested `OrderService` rows (price snapshot) → idempotency
   result saved.
10. After commit, `OrderCreatedEvent` is dispatched.

### Status change — `OrdersService.updateStatus`

Runs in a transaction: loads the order, validates the transition against
`VALID_STATUS_TRANSITIONS`, updates, then dispatches `OrderStatusChangedEvent` — plus
`OrderCancelledEvent` when the new status is `CANCELLED`.

### Delete and restore

Soft delete sets `deletedAt`. Restore re-reads the tenant/branch-scoped deleted row inside
its reservation transaction on every retry. Non-terminal orders revalidate the active parent,
reserve the stored post and employee with buffer, and clear `deletedAt` atomically. On create,
omitted or explicit JSON-null resources mean automatic assignment; restore keeps legacy null
assignments null. Terminal orders do not reserve capacity; a conflict prevents the
restore without changing the row.

### Payments

`PaymentsRepository.withLockedOrder` locks the active tenant-scoped parent order with
`SELECT … FOR UPDATE` in a `ReadCommitted` transaction. Existing payment totals, the Decimal
comparison against the order total, and insertion all happen under that lock. A waiter sees
the preceding committed payment, so two 75 payments against a 100 order cannot both succeed.
Amounts such as 0.10 + 0.20 remain exact through Prisma Decimal arithmetic and persistence.
`PaymentReceivedEvent` is dispatched only after commit. The HTTP idempotency interceptor is
separate from this monetary concurrency guarantee.

---

## Subscriptions and billing (Paddle)

### Plans — `src/modules/subscriptions/plan.constants.ts`

| Tier         | Monthly | Yearly | branches | workPosts | users     | services  |
| ------------ | ------- | ------ | -------- | --------- | --------- | --------- |
| `TRIAL`      | free    | —      | 3        | 10        | 15        | 20        |
| `STARTER`    | $29     | $290   | 1        | 5         | 5         | 15        |
| `BUSINESS`   | $79     | $790   | 5        | 25        | 25        | 50        |
| `ENTERPRISE` | $199    | $1990  | 25       | 100       | unlimited | unlimited |

`null` means unlimited. Yearly price = 10 × monthly (two months free).
`PLAN_CATALOG` exposes `STARTER`, `BUSINESS`, `ENTERPRISE` (the trial is not purchasable) and
marks all three `addonsAvailable: true`.

### Add-ons — `ADDON_DEFINITIONS`

| Resource    | Unit size | Monthly price |
| ----------- | --------- | ------------- |
| `branches`  | 1         | $15           |
| `workPosts` | 5         | $10           |
| `users`     | 5         | $5            |
| `services`  | 10        | $5            |

Effective limit = `baseLimit + quantity × ADDON_UNIT_SIZE[resource]`.

### Limit enforcement — `SubscriptionLimitsService.withResourceLimit`

`UsersService`, `BranchesService`, `WorkPostsService` and `ServicesService` wrap both create
and restore in `withResourceLimit`. `SubscriptionsRepository` locks the stable tenant row
with `SELECT … FOR UPDATE` in a `ReadCommitted` transaction, checks subscription state and
current usage, and performs the mutation on that same transaction client. Waiters count the
previous writer's committed resources. Transaction callbacks set tenant filters and `tenantId`
on writes explicitly. `checkLimit` / `checkLimitAtomic` alone are previews, not a reservation:

1. **No `Subscription` row → allowed, no limits** (backward compatibility).
2. `isTrial && trialEndsAt < now` → `403 Trial has expired`.
3. `status === CANCELLED` **and** (`cancelEffectiveAt` is null **or** already in the past) →
   `403 Subscription is inactive…`.
4. `status === PAUSED` **or** `status === PAST_DUE` → `403 Subscription is inactive…`.
5. `max === null` → allowed. Otherwise `count < max`, else
   `403 Subscription limit reached: maximum <n> <resource> allowed`.

### Status model

`TRIALING → ACTIVE → PAST_DUE | PAUSED | CANCELLED`, and `CANCELLED → ACTIVE` on resubscribe.
Cancellation records `cancelledAt` and `cancelEffectiveAt`, so access continues until the end of
the paid period.

### Paddle integration

- Checkout: `POST /subscription/checkout` returns a transaction id plus the client token; the
  browser opens the Paddle overlay via `@paddle/paddle-js`.
- Webhooks: `POST /api/v1/webhooks/paddle` — `@Public()`, `@SkipThrottle()`.
  Requires the `Paddle-Signature` header (`ts=…;h1=…`) and the raw body (`rawBody: true` in
  `main.ts`); verification is HMAC-SHA256 with `timingSafeEqual`. Processing is made idempotent
  by a Redis `SET … NX` on `event_id` (prefix `paddle:webhook:`, 24 h TTL).
  Handled: `subscription.created`, `subscription.updated`, `subscription.canceled`,
  `subscription.past_due`, `subscription.paused`, `subscription.resumed`,
  `transaction.completed`.
- Prices are cached in Redis under `paddle:prices:` by `PaddlePriceCacheService`, refreshed
  once at startup and then hourly (`@Cron(EVERY_HOUR)`), with a 1 h TTL on the `catalog` key.
  A refresh is skipped when no price ids resolve or the Paddle circuit breaker is open; any
  read failure falls back to the hard-coded `PLAN_CATALOG` / `ADDON_DEFINITIONS` prices.
- **The backend is the source of truth** for entitlement; Paddle state is mirrored onto
  `Subscription`.
- **Feature flag**: `PAYMENTS_ENABLED` gates `checkout`, `change-plan`, `addons`, `cancel`,
  `reactivate` through `PaymentsEnabledGuard` (503 when off). `status`, `usage`, `plans`,
  `billing`, `transactions`, `preview` remain available.
- Downgrades are validated against current usage including add-ons before the plan change is
  accepted.
- `PAYMENTS_ENABLED` defaults to false, including production Compose, and accepts only the
  explicit strings `true` / `false`. When enabled in any environment, `PADDLE_API_KEY`,
  `PADDLE_CLIENT_TOKEN` and `PADDLE_WEBHOOK_SECRET` must all be nonblank. Partial credential
  sets are rejected even when payments are disabled.

### Trial provisioning

New tenants get `TRIAL` with `TRIAL_DEFAULTS` (derived from `PLAN_LIMITS[TRIAL]`):
15 users, 3 branches, 10 work posts, 20 services, `durationDays: 30`.

---

## Idempotency

Two mechanisms, deliberately:

| Mechanism         | Used by                                                                       | How it works                                                                                                                        |
| ----------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Service-level** | `POST /orders`, `POST /public/booking/:slug/book`, `POST /public/widget/book` | `checkTx` → `acquireLockTx` → work → `saveResultTx`, all inside the same `Serializable` transaction                                 |
| **Interceptor**   | `POST /orders/:orderId/payments`                                              | `IdempotencyInterceptor` reads the `idempotency-key` header, replays a cached response, or stores the result after the handler runs |

Shared rules:

- Key source: the `idempotency-key` request header (also allow-listed in CORS).
- The interceptor ignores keys longer than 128 chars or not matching `^[\w\-:.]+$`.
- Tenant discriminator: the authenticated `tenantId`, else `slug:<tenantSlug>` from the route
  params. With neither, idempotency is skipped and a warning is logged.
- `acquireLock` is an `INSERT … ON CONFLICT DO NOTHING`: the first caller wins;
  a concurrent second caller gets `409 Request is being processed`.
- A stored row with `statusCode > 0` and a future `expiresAt` is a **hit** and is replayed.
- TTL 24 h; `IdempotencyCleanupService` prunes hourly.

---

## Soft delete

Nine models: `User`, `Client`, `Order`, `Vehicle`, `Service`, `Branch`, `Role`, `WorkPost`,
`EmployeeProfile`.

- Reads through `forTenant()` add `deletedAt: null` automatically.
- Bypass with `where._includeDeleted: true` (service layer) or the `includeDeleted` query
  parameter on `PaginationDto`.
- `PATCH /:id/restore` exists for `users`, `clients`, `orders`, `vehicles`, `services`,
  `branches`, `roles`, `work-posts`. **`workforce/profiles` has no restore route** — its
  `DELETE` requires the profile to be inactive.
- Restore re-checks constraints: subscription limits (users, branches, work posts, services) and
  scheduling conflicts (orders).
- `CleanupService` hard-deletes rows older than `CLEANUP_RETENTION_DAYS` (default 30) daily at
  02:00, children before parents, inside one transaction.
- **Uniqueness is not soft-delete aware** — there are no partial unique indexes, so a
  soft-deleted `User` still holds its email and a soft-deleted `EmployeeProfile` still holds its
  `userId`. See [data-model.md](./data-model.md#5-schema-gaps-and-sharp-edges).

---

## Public booking

Two `@Public()` controllers over one service, so the rules cannot drift apart:

| Controller                      | Route prefix                  | Tenant resolution                                     |
| ------------------------------- | ----------------------------- | ----------------------------------------------------- |
| `PublicBookingController`       | `/public/booking/:tenantSlug` | `TenantsRepository.findBySlug` (slug validated first) |
| `PublicBookingHeaderController` | `/public/widget`              | `x-carwash-tenant-id` UUID header                     |

Both resolve the tenant and require `isActive`, else `404 Car wash not found`.

`createBookingInternal`:

1. Branch must belong to the tenant.
2. Booking settings are resolved; `allowOnlineBooking === false` → `403 Online booking is not available`.
3. When a `workPostId` is supplied, a **pre-check** (`validateNoOverlap`) fails fast with
   `409 This time slot just became unavailable. Please select a different time.` so no orphan
   client/vehicle rows are created.
4. Client and vehicle are found-or-created inside a `Serializable` transaction; lookups filter
   `deletedAt: null`, so soft-deleted records are never reused. Missing `vehicleMake` defaults to
   `'Unknown'`.
5. `OrdersService.create` is called with `source: 'WEB'` and `userId: null`; the real reservation
   and locking happen there.
6. A late `No available work posts` / `No available employees` from step 5 is translated back
   into the same friendly `409`.

The result is projected through `toBookingConfirmation` after order creation or idempotency
replay. Its allow-list includes booking id, branch id/contact details, start/end, numeric total
and service snapshots. Client and vehicle display fields come only from the current submitted
DTO: matching a stored phone/plate does not authenticate ownership of historical CRM data.
Stored email, notes, internal client/vehicle/employee/tenant ids, password hashes and full
relations are not returned. Both public routes use the same contract.

Because `source === 'WEB'`, the order starts as `BOOKED_PENDING_CONFIRMATION` and a
30-minute confirmation-timeout job is queued.

Rate limits are declared per route (`@Throttle`) — see the caveat in
[architecture.md](./architecture.md#guards-in-order) about the `default` throttler name.

---

## Domain events and side effects

Services emit `DomainEvent`s; subscribers do the work. Full catalogue, emitters and consumers:
[architecture.md](./architecture.md#event-catalogue).

- **Audit** — `AuditSubscriber` writes `audit_logs` for order created/status-changed/cancelled,
  client deleted/merged, auth login/login-failed/password-changed/logout, and super-admin tenant
  access. Emails are masked (`ab***@example.com`). Failures are logged and swallowed.
- **Realtime** — `RealtimeSubscriber` emits `order.created`, `order.status_changed`,
  `order.cancelled` to `tenant:{id}` and, when present, `branch:{id}`.
- **Jobs** — `JobsSubscriber` queues an order-confirmation notification and an analytics record
  on `order.created` (plus a 30-minute confirmation timeout for `WEB` orders), and a
  status-update notification on `order.status_changed`.

---

## Email, realtime and background jobs

**Email (Resend)** — `EmailModule` is `@Global()`. `EmailService` is a no-op without
`RESEND_API_KEY`, is wrapped in a circuit breaker (5 failures → open for 30 s), and **never
throws**. Templates are pure functions in `email-templates.ts`: password reset, account locked,
order confirmation, status update, booking reminder.

**Realtime** — namespace `/events`; JWT verified on handshake and non-`access` tokens rejected;
sockets auto-join `tenant:{tenantId}`; a 60 s sweep disconnects clients with expired tokens; in
production an empty or `*` `CORS_ORIGINS` means the gateway denies all origins.

**Jobs** — three BullMQ queues (`notifications`, `analytics`, `booking-confirmations`) with
exponential backoff and 3 attempts (booking reminder: 2 attempts with a delay).
`NotificationProcessor` loads the order from PostgreSQL and sends the real email.

---

## Support requests

`POST /support` is `@Public()` and rate-limited to 3/min. It works for authenticated and
anonymous callers: `tenantId`/`userId` fall back to the literal `'anonymous'`, and the email
falls back to the optional `email` field in the body. `SupportService` relays an HTML-escaped
message to Telegram with a 5 s timeout; when the bot token or chat id is missing it logs
`Telegram support not configured — request dropped` and the endpoint still returns success.

---

Related: [architecture.md](./architecture.md) · [modules.md](./modules.md) ·
[data-model.md](./data-model.md) · [reference.md](./reference.md)
