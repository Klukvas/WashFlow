# Business Logic

The domain rules that make WashFlow correct. Enforced primarily in the **service and data
layers**, not just the UI. Part of the [context set](./README.md) · source of truth:
[`OVERVIEW.md`](../../OVERVIEW.md).

## Multi-Tenancy & Data Isolation

- Every table (except the global `Permission` table) carries a `tenantId` column.
- `TenantPrismaService` uses Prisma Client Extensions to **auto-inject `tenantId`** into all
  CRUD and **auto-filter `deletedAt: null`** for soft-delete models.
- `@CurrentTenant()` decorator extracts `tenantId` from the JWT.
- Isolation is enforced at the **data layer**, not just the API layer — there is no way to
  "forget" a tenant filter.

## Authentication & RBAC

- **JWT**: stateless access token (15 min) + refresh token (7 days).
- **Passwords**: hashed with Argon2.
- **Guards**: global `JwtAuthGuard` (`APP_GUARD`) protects all routes; `@Public()` opts out.
- **Permissions**: `@Permissions('orders.create')` + `PermissionsGuard` — 47 permissions
  across 14 modules. `isSuperAdmin: true` bypasses all permission checks.
- **Rate limiting**: `ThrottlerGuard` — short (10 req/1s) + long (100 req/60s).
- **Account lockout**: 5 failed logins → account locked 30 min; auto-reset on success;
  dispatches `AuthAccountLockedEvent`.
- **Password reset**: forgot-password → emailed token link (1h expiry) → reset-password
  invalidates all sessions via `tokenVersion++`. Unknown emails get a silent success
  response (no info leak).

## Scheduling Engine

- Generates time slots from working hours, subtracts occupied slots plus a configurable
  buffer.
- **Slot merging** across work posts — a slot is available if ANY post is free.
- **Workforce cap**: `EffectiveCapacity = min(freeWorkPosts, availableWorkers)`. Slots are
  capped by employees on shift with no conflicting orders. Falls back to post-only capacity
  when no workforce profiles exist (backward compatible).
- **`SELECT FOR UPDATE`** row-level locking inside a `Serializable` transaction prevents
  double-booking. On concurrent bookings, one succeeds and the other gets `409 Conflict`.
- **Business rules**: `workingDays` (rejects non-working days) and `maxAdvanceBookingDays`
  (caps how far ahead a booking can be placed) — checked in both availability and order
  creation.
- **UTC-consistent**: all time comparisons use UTC to avoid server-timezone drift.
  `COMPLETED` orders are excluded from availability (slots freed on completion).

## Workforce Layer

Tracks operational employees independently of RBAC (Users/Roles are unchanged).

- **EmployeeProfile** links a User to a Branch with an `isWorker` flag,
  `efficiencyCoefficient` (reserved), and optional `workStartTime`/`workEndTime` (HH:MM)
  defining the daily working window.
- **Auto-assignment**: on order creation the system picks the first available employee
  (working hours cover the window, no conflicting active orders) and stores
  `assignedEmployeeId` on the order.
- **Zero-profile fallback**: branches without profiles behave exactly as before — no
  capacity reduction.

## Order Lifecycle

Status state machine with enforced transitions:

```
BOOKED_PENDING_CONFIRMATION -> BOOKED, CANCELLED
BOOKED                      -> IN_PROGRESS, CANCELLED, NO_SHOW
IN_PROGRESS                 -> COMPLETED, CANCELLED
COMPLETED / CANCELLED / NO_SHOW  -> (terminal)
```

**Creation flow**: validate services → calculate price/duration → enforce `workingDays` +
`maxAdvanceBookingDays` → `$transaction` (auto-assign work post with lock + auto-assign
employee with buffer) → dispatch domain event. Restore validates scheduling conflicts
before un-deleting non-terminal orders.

## Subscription & Billing (Paddle)

- **Plan tiers**: Trial (30 days, free) → Starter ($29/mo) → Business ($79/mo) →
  Enterprise ($199/mo); annual billing = 2 months free.
- **Subscription model**: 1:1 with Tenant — `planTier`, `status`, `billingInterval`,
  nullable `maxUsers/maxBranches/maxWorkPosts/maxServices` (null = unlimited).
- **Add-ons**: per-unit resource boosts (branches +1/$15, work posts +5/$10, users +5/$5,
  services +10/$5) on Starter/Business.
- **Effective limits**: `baseLimits[resource] + addon.quantity * unitSize`; recalculated on
  every plan/addon change.
- **Enforcement**: `SubscriptionLimitsService.checkLimit()` runs before create and restore —
  checks trial expiry, subscription status (CANCELLED past effective date / PAUSED → deny),
  and resource limits (null = unlimited).
- **Status state machine**: TRIALING → ACTIVE → PAST_DUE / PAUSED / CANCELLED;
  CANCELLED → ACTIVE (resubscribe).
- **Paddle integration**: checkout via Paddle.js overlay; webhooks for lifecycle events
  (created/updated/canceled/past_due/paused/resumed, transaction.completed).
- **Webhook security**: HMAC-SHA256 signature verification (`Paddle-Signature`), Redis
  idempotent processing (SETNX + 24h TTL), raw-body access via NestJS `rawBody`.
- **Downgrade validation**: before moving to a lower plan, current usage must fit the new
  effective limits (incl. addons); otherwise `409 Conflict` with details.
- **Trial auto-provisioning**: new tenants get a 30-day trial (15 users, 3 branches, 10 work
  posts, 20 services). No Subscription row → no limits enforced (backward compatible).
- **Feature flag**: `PAYMENTS_ENABLED` gates all Paddle mutations; read-only subscription
  views are always available.

## Idempotency

- **Service-level** (Orders, Public Booking): check + lock + save inside a `Serializable
  $transaction`.
- **Interceptor-level** (Payments): `IdempotencyInterceptor` reads the `Idempotency-Key`
  header.
- **Race handling**: `INSERT ... ON CONFLICT DO NOTHING` — first wins, second gets `409`.
  24h TTL, hourly cleanup cron.

## Soft Delete

9 models: User, Client, Order, Vehicle, Service, Branch, Role, WorkPost, EmployeeProfile.

- Auto-filtered via `TenantPrismaService.$extends` on all reads.
- Bypass with `_includeDeleted: true` (service) or `?includeDeleted=true` (query param).
- Partial unique indexes `WHERE deleted_at IS NULL` allow re-creating a record after delete.
- `PATCH /:id/restore` on all 9 models. A daily 2 AM cron hard-deletes records older than
  30 days.

## Public Booking

Rate-limited `@Public()` endpoints for customer-facing booking, via two controllers that
delegate to shared `*Internal` methods (zero duplication):

- **Slug-based** (`/public/booking/:slug/*`) — tenant resolved by slug.
- **Header-based** (`/public/widget/*`) — tenant resolved by `x-carwash-tenant-id` UUID
  header.

Both check `allowOnlineBooking`. Soft-deleted vehicles/clients are filtered from lookups.
TOCTOU failures surface as friendly "slot unavailable" messages.

## Domain Events & Side Effects

Built on NestJS `EventEmitter2`. Core logic emits events; async subscribers handle audit
logging, WebSocket broadcasting, and BullMQ job queueing — decoupled from the request path.

Events: `ORDER_CREATED`, `ORDER_UPDATED`, `ORDER_STATUS_CHANGED`, `ORDER_CANCELLED`,
`CLIENT_DELETED`, `PAYMENT_RECEIVED`, `BOOKING_CONFIRMED`, `CLIENT_MERGED`, `AUTH_LOGIN`,
`AUTH_LOGIN_FAILED`, `AUTH_PASSWORD_CHANGED`, `AUTH_LOGOUT`, `SUPERADMIN_TENANT_ACCESS`,
`SUBSCRIPTION_ACTIVATED`, `SUBSCRIPTION_CHANGED`, `SUBSCRIPTION_CANCELLED`,
`AUTH_ACCOUNT_LOCKED`, `AUTH_PASSWORD_RESET_REQUESTED`.

## Realtime, Email & Background Jobs

- **Realtime**: Socket.IO on the `/events` namespace; JWT auth on handshake; auto-join
  `tenant:{id}` rooms; domain events bridged to WS broadcasts (`order.created`,
  `order.status_changed`, `order.cancelled`).
- **Email (Resend)**: `@Global()` `EmailModule`; no-op when `RESEND_API_KEY` is empty
  (dev/test safe); best-effort (errors logged, never thrown). Templates: password reset,
  account locked, order confirmation, status update, booking reminder.
- **Background jobs**: 3 BullMQ queues — `notifications`, `analytics`,
  `booking-confirmations`. Exponential backoff, 3 attempts. `NotificationProcessor` sends
  real emails for order-confirmation, status-update, and booking-reminder jobs.
