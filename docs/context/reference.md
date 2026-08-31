# Reference

Env vars, database schema, full API surface, and seed data. Part of the
[context set](./README.md) · source of truth: [`OVERVIEW.md`](../../OVERVIEW.md).

## Environment Variables

Validated at startup with Zod — fails fast with clear errors.

| Variable | Req | Default | Description |
|----------|-----|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `REDIS_URL` | Yes | — | Redis connection string |
| `JWT_ACCESS_SECRET` | Yes | — | Access token secret (min 32 chars) |
| `JWT_REFRESH_SECRET` | Yes | — | Refresh token secret (min 32 chars) |
| `JWT_ACCESS_EXPIRATION` | No | `15m` | Access token TTL |
| `JWT_REFRESH_EXPIRATION` | No | `7d` | Refresh token TTL |
| `PORT` | No | `3000` | Server port |
| `NODE_ENV` | No | `development` | Environment |
| `CORS_ORIGINS` | No | `*` | Comma-separated origins |
| `PADDLE_API_KEY` | No | — | Paddle API key (billing) |
| `PADDLE_CLIENT_TOKEN` | No | — | Paddle client-side token (checkout) |
| `PADDLE_WEBHOOK_SECRET` | No | — | Paddle webhook HMAC secret |
| `PADDLE_SANDBOX` | No | `true` | Use Paddle sandbox |
| `PADDLE_PRICE_IDS` | No | — | JSON map of price IDs (overrides defaults) |
| `PADDLE_ADDON_PRICE_IDS` | No | — | JSON map of addon price IDs |
| `PAYMENTS_ENABLED` | No | `false` | Feature flag — enable Paddle payment mutations |
| `RESEND_API_KEY` | No | — | Resend API key (transactional email) |
| `EMAIL_FROM` | No | `WashFlow <noreply@washflow.solutions>` | Sender address |
| `FRONTEND_URL` | No | `http://localhost:5173` | Frontend base URL (reset links) |
| `CLEANUP_RETENTION_DAYS` | No | `30` | Days before soft-deleted rows are hard-deleted |
| `SENTRY_DSN` / `VITE_SENTRY_DSN` | No | — | Sentry DSN (backend / frontend) |
| `SENTRY_TRACES_SAMPLE_RATE` | No | — | Performance trace sampling (0–1) |
| `METRICS_TOKEN` | No | — | Bearer token protecting `/metrics` (empty = open) |
| `GRAFANA_LOKI_HOST` / `_USERNAME` / `_PASSWORD` | No | — | Grafana Cloud Loki push credentials |

## Database Schema

**20 models, 8 enums.** All UUIDs + timestamps. Soft-delete on 9 models with auto-filtering.

### Enums

| Enum | Values |
|------|--------|
| `OrderStatus` | BOOKED, BOOKED_PENDING_CONFIRMATION, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW |
| `OrderSource` | INTERNAL, WEB, WIDGET, API |
| `PaymentStatus` | PENDING, PAID, PARTIALLY_PAID, REFUNDED, FAILED |
| `PaymentMethod` | CASH, CARD, ONLINE, OTHER |
| `AuditAction` | CREATE, UPDATE, DELETE, STATUS_CHANGE, MERGE |
| `PlanTier` | TRIAL, STARTER, BUSINESS, ENTERPRISE |
| `BillingInterval` | MONTHLY, YEARLY |
| `SubscriptionStatus` | TRIALING, ACTIVE, PAST_DUE, PAUSED, CANCELLED |

### Models

| Model | Key Details |
|-------|-------------|
| **Tenant** | Unique slug, settings JSON, 1:1 BookingSettings |
| **BookingSettings** | Slot duration, buffer, working hours/days, online-booking toggle |
| **Branch** | Per-tenant, has many WorkPosts, soft-delete |
| **User** | Globally unique email, soft-delete, optional Role + Branch; `failedLoginAttempts` + `accountLockedUntil` |
| **Role** | Unique name per tenant, M:N Permissions, soft-delete |
| **RolePermission** | Join table Role ↔ Permission |
| **Permission** | Global (no tenantId), seeded `module.action` pairs |
| **Client** | Unique phone per tenant, soft-delete |
| **Vehicle** | Linked to Client; make (req), licensePlate (opt), `photoUrl` (opt), soft-delete |
| **Service** | Name, duration, price (decimal), sortOrder, soft-delete |
| **WorkPost** | Bay per Branch |
| **EmployeeProfile** | Links User↔Branch; `isWorker`, `efficiencyCoefficient`, `active`, `workStartTime`/`workEndTime`; unique per userId |
| **Order** | Status state machine, scheduling window, all relations; optional `assignedEmployeeId` |
| **OrderService** | Price snapshot at booking time |
| **Payment** | Amount, method, status, linked to Order |
| **AuditLog** | Entity type/id, action, old/new values, performer |
| **Subscription** | 1:1 Tenant; plan/status/interval; nullable limits; `isTrial` + `trialEndsAt`; Paddle fields; `cancelledAt`/`cancelEffectiveAt` |
| **SubscriptionAddon** | Belongs to Subscription; `resource` + `quantity`; unique per (subscriptionId, resource) |
| **PasswordResetToken** | userId, unique token, 1h expiry, `usedAt` tracking |
| **IdempotencyKey** | Tenant-scoped, unique `(tenantId, key)`, TTL-based expiry |

**Key indexes**: Order `(tenantId, status)` and `(tenantId, workPostId, scheduledStart,
scheduledEnd)`; all models indexed on `tenantId`; global unique `users(email)`; partial
uniques (`WHERE deletedAt IS NULL`) on `clients(tenantId, phone)`,
`vehicles(tenantId, licensePlate)`, `roles(tenantId, name)`.

## API Reference

All endpoints are prefixed with `/api/v1` and JWT-protected unless marked Public.
105 endpoints (92 protected, 13 public) across 22 controllers.

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | Public | Returns access + refresh tokens |
| POST | `/auth/register` | Public | Self-registration: tenant + trial + admin role + user (3/min) |
| POST | `/auth/refresh` | Public | Refresh tokens |
| POST | `/auth/forgot-password` | Public | Request reset email (3/min); silent for unknown emails |
| POST | `/auth/reset-password` | Public | Reset with token (5/min); invalidates all sessions |
| POST | `/auth/logout` | JWT | Increments tokenVersion, clears refresh cookie |
| PATCH | `/auth/change-password` | JWT | Change own password (verifies current) |

### CRUD resources

Standard pattern per resource: `GET /` · `GET /:id` · `POST /` · `PATCH /:id` ·
`DELETE /:id` (soft) · `PATCH /:id/restore`.

| Resource | Permission | Notes |
|----------|------------|-------|
| `/tenants` | `tenants.*` | No delete/restore |
| `/users` | `users.*` | + `PATCH /:id/reset-password` (admin resets any user) |
| `/roles` | `roles.*` | + `POST /:id/permissions` |
| `/branches` | `branches.*` | + `GET\|PATCH /:id/booking-settings` |
| `/clients` | `clients.*` | Searchable; + `POST /merge` |
| `/vehicles` | `vehicles.*` | Filter by clientId; + `POST /:id/photo` (5MB, image/*) |
| `/services` | `services.*` | |
| `/work-posts` | `work-posts.*` | Requires `?branchId` |

### Orders & Payments

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/orders` | orders.read | List (filter: status, date, branch) |
| GET | `/orders/availability` | scheduling.read | Available time slots |
| GET | `/orders/:id` | orders.read | Details |
| POST | `/orders` | orders.create | Create (idempotent via `Idempotency-Key`) |
| PATCH | `/orders/:id/status` | orders.update | Status transition |
| DELETE | `/orders/:id` | orders.delete | Soft delete |
| PATCH | `/orders/:id/restore` | orders.update | Restore |
| GET | `/orders/:orderId/payments` | payments.read | List for order |
| POST | `/orders/:orderId/payments` | payments.create | Record (idempotent) |

### Analytics

All require `analytics.view`. Params: `dateFrom`, `dateTo`, `branchId` (optional).

| Path | Description |
|------|-------------|
| `/analytics/dashboard` | Summary stats (orders, revenue, clients, completion rate) |
| `/analytics/revenue` | Revenue breakdown by date range |
| `/analytics/services` | Most popular services by order count |
| `/analytics/kpi` | Today's KPIs: revenue, orders, avg duration, cancel rate, active clients, occupancy |
| `/analytics/live` | Real-time: in-progress, waiting, free posts, overdue |
| `/analytics/branches` | Per-branch revenue, orders, avg check, load rate |
| `/analytics/employees` | Per-employee orders, revenue, cancel rate |
| `/analytics/alerts` | Anomalies: high cancel rate, revenue drop, booking decline |
| `/analytics/online-booking` | Order source breakdown (INTERNAL/WEB/WIDGET/API) |
| `/analytics/export/orders` | CSV export of orders |
| `/analytics/export/clients` | CSV export of clients |

### Subscriptions & Billing

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/subscription/usage` | tenants.read | Own limits + usage + tier + addons |
| GET | `/subscription/plans` | tenants.read | Plan catalog (tiers, prices, addons) |
| POST | `/subscription/checkout` | tenants.update | Paddle checkout → transactionId + clientToken |
| POST | `/subscription/change-plan` | tenants.update | Change plan tier via Paddle |
| POST | `/subscription/addons` | tenants.update | Manage add-on quantities |
| POST | `/subscription/preview` | tenants.read | Preview price change |
| POST | `/subscription/cancel` | tenants.update | Cancel (access until period end) |
| POST | `/webhooks/paddle` | Public | Paddle webhook (signature-verified) |
| GET/PUT/DELETE | `/tenants/:id/subscription` | SuperAdmin | Get / create-update / remove tenant subscription |

### Workforce, Audit & Support

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/workforce/profiles` | workforce.read | List profiles (paginated) |
| GET | `/workforce/profiles/:id` | workforce.read | Single profile |
| POST | `/workforce/profiles` | workforce.create | Create (one per user) |
| PATCH | `/workforce/profiles/:id` | workforce.update | Update profile |
| DELETE | `/workforce/profiles/:id` | workforce.delete | Delete (must be inactive) |
| GET | `/audit-logs` | audit.* | Filter by entity, action, date range |
| POST | `/support` | Public | Send support request (3/min); auth optional |

### Public Booking

| Method | Path | Limit | Description |
|--------|------|-------|-------------|
| GET | `/public/booking/:slug/availability` | 10/min | Time slots (slug-based) |
| GET | `/public/booking/:slug/services` | 10/min | Active services |
| GET | `/public/booking/:slug/branches` | 10/min | Active branches |
| POST | `/public/booking/:slug/book` | 3/min | Create booking (idempotent) |
| GET | `/public/widget/services\|branches\|availability` | 10/min | Widget (header `x-carwash-tenant-id`) |
| POST | `/public/widget/book` | 3/min | Create booking (idempotent) |

### WebSocket

Namespace `/events`, JWT auth on handshake, rooms `tenant:{id}` / `branch:{id}`; events
`order.created`, `order.status_changed`, `order.cancelled`.

## Seed Data

`prisma/seed.ts` builds a demo environment simulating **1 year of operations**
(`npx prisma db seed`; idempotent — skips if data exists).

| Entity | Count | Details |
|--------|-------|---------|
| Tenant | 1 | `WashFlow Demo` (slug: `demo`) |
| Permissions | 47 | `module.action` pairs across 14 modules |
| Branches | 3 | Центральний (4 posts), Лівобережний (3), Подільський (4) |
| Services | 8 | Express wash (15 min / 250 UAH) → Ceramic coating (120 min / 3500 UAH) |
| Roles | 4 | Admin + Manager + Operator + Receptionist |
| Staff | 18 | 6 + 5 + 7 per branch |
| Clients | 250 | Ukrainian names/phones, 60% with email |
| Vehicles | ~400 | 1–3 per client, 10 makes, Ukrainian plates |
| Orders | ~2,600 | Day-by-day slot filling, zero conflicts |
| Payments | ~1,800 | COMPLETED orders: 40% CASH / 50% CARD / 10% ONLINE |
| Audit Logs | ~4,800 | CREATE + STATUS_CHANGE entries |

**Order generation**: today − 365 days → today (skips Sundays); seasonal demand
(Jan 0.6× → Jul 1.5× → Dec 0.55×); per-post `nextAvailableTime` tracking (08:00–19:00)
guarantees zero conflicts; status mix (past ~70% COMPLETED / 12% CANCELLED / 5% NO_SHOW,
future BOOKED); sources 60% INTERNAL / 20% WEB / 15% WIDGET / 5% API.
