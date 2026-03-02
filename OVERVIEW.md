# WashFlow — Multi-Tenant CarWash CRM

Full-stack CRM for managing car wash businesses. NestJS + React, Prisma, PostgreSQL, Redis, WebSockets. Multi-tenancy with full data isolation, RBAC, scheduling engine with row-level locking, workforce capacity tracking, public booking, realtime events, background jobs, idempotent mutations, and unified soft-delete with auto-filtering.

## Table of Contents

- [Quick Start](#quick-start)
- [Tech Stack](#tech-stack)
- [Backend](#backend)
- [Frontend](#frontend)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Architecture Decisions](#architecture-decisions)
- [Seed Data Details](#seed-data-details)

---

## Quick Start

### Prerequisites

Node.js 20+ | pnpm | PostgreSQL 16 | Redis 7

### Setup

```bash
pnpm install
cp .env.example .env            # edit with your DB/Redis credentials
npx prisma generate
npx prisma db push
npx prisma db seed              # prints Tenant ID (save it for login)
```

```bash
pnpm start:dev                  # backend  → http://localhost:3000
cd frontend && pnpm dev         # frontend → http://localhost:5173
```

### Docker

```bash
docker compose up                                    # full stack
docker compose -f docker-compose.dev.yml up          # DB + Redis only
```

### Demo Credentials

The login form requires **Tenant ID** (UUID), **Email**, and **Password**.

| Account | Email | Password | Permissions |
|---------|-------|----------|-------------|
| Super Admin | `admin@washflow.com` | `admin123` | All (47 permissions) |
| Staff Users | `<name>@washflow.com` | `password123` | Role-scoped |

Staff emails are transliterated Ukrainian names (e.g. `oleksandr.marchenko@washflow.com`). First user per branch is **Manager**, rest are **Operator** / **Receptionist**.

```bash
# Retrieve Tenant ID
psql $DATABASE_URL -c "SELECT id FROM tenants WHERE slug = 'demo';"

# List all staff with roles
psql $DATABASE_URL -c "
  SELECT u.email, r.name AS role, b.name AS branch
  FROM users u
  JOIN roles r ON u.role_id = r.id
  LEFT JOIN branches b ON u.branch_id = b.id
  WHERE u.is_super_admin = false
  ORDER BY b.name, r.name;
"
```

### Testing & Build

```bash
pnpm test                       # unit tests
pnpm test:watch                 # watch mode
pnpm test:e2e                   # end-to-end
pnpm build && pnpm start:prod   # production build
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `REDIS_URL` | Yes | — | Redis connection string |
| `JWT_ACCESS_SECRET` | Yes | — | Access token secret (min 32 chars) |
| `JWT_REFRESH_SECRET` | Yes | — | Refresh token secret (min 32 chars) |
| `JWT_ACCESS_EXPIRATION` | No | `15m` | Access token TTL |
| `JWT_REFRESH_EXPIRATION` | No | `7d` | Refresh token TTL |
| `PORT` | No | `3000` | Server port |
| `NODE_ENV` | No | `development` | Environment |
| `CORS_ORIGINS` | No | `*` | Comma-separated origins |

Validated at startup with Zod — fails fast with clear errors.

---

## Tech Stack

### Backend

| Layer | Technology |
|-------|------------|
| Framework | NestJS 11 |
| ORM | Prisma 7 (PostgreSQL driver adapter) |
| Database | PostgreSQL 16 |
| Cache / Queues | Redis 7 + BullMQ |
| Auth | JWT (access + refresh) via Passport |
| Realtime | Socket.IO |
| Validation | class-validator + class-transformer |
| Password Hashing | Argon2 |
| Rate Limiting | @nestjs/throttler |

### Frontend

| Layer | Technology |
|-------|------------|
| Framework | React 19 + Vite |
| Styling | TailwindCSS 4 |
| State | Zustand + TanStack React Query |
| Forms | React Hook Form + Zod |
| Routing | React Router 7 |
| i18n | i18next (EN / UK) |
| UI | Shadcn-based custom components |
| Charts | Recharts (lazy-loaded) |

### Infrastructure

pnpm | Docker + Docker Compose | TypeScript 5.x (strict)

---

## Backend

### Multi-Tenancy

- Every table (except `Permission`) has a `tenantId` column
- `TenantPrismaService` uses Prisma Client Extensions to auto-inject `tenantId` into all CRUD and auto-filter `deletedAt: null` for soft-delete models
- `@CurrentTenant()` decorator extracts tenantId from JWT
- Isolation enforced at the data layer, not just API layer

### Auth & RBAC

- **JWT**: access token (15 min) + refresh token (7 days), stateless
- **Passwords**: Argon2
- **Guards**: global `JwtAuthGuard` via `APP_GUARD` — all routes protected by default
- **Bypass**: `@Public()` decorator for open endpoints
- **Permissions**: `@Permissions('orders.create')` decorator + `PermissionsGuard` (47 permissions across 14 modules)
- **Super-admin**: `isSuperAdmin: true` bypasses all permission checks
- **Rate limiting**: ThrottlerGuard — short (10 req/1s) + long (100 req/60s)

### Scheduling Engine

- Generates time slots from working hours, subtracts occupied slots + configurable buffer
- Slot merging across work posts — available if ANY post is free
- **Workforce cap**: `EffectiveCapacity = min(freeWorkPosts, availableWorkers)` — slots are capped by employees on shift with no conflicting orders (with buffer). Falls back to post-only capacity when no workforce profiles exist (backward compatible).
- `SELECT FOR UPDATE` row-level locking in `Serializable` transaction prevents double-booking
- Concurrent bookings: one succeeds, one gets `409 Conflict`
- **Business rule enforcement**: `workingDays` (rejects bookings on non-working days) + `maxAdvanceBookingDays` (caps how far ahead bookings can be placed) — both checked in availability and order creation
- **UTC-consistent**: all time comparisons use UTC methods to avoid server-timezone drift
- COMPLETED orders excluded from availability (slots freed upon completion)

### Workforce Layer

Tracks operational employees independently of RBAC (Users/Roles remain unchanged).

- **EmployeeProfile**: links a User to a Branch with `isWorker` flag, `efficiencyCoefficient` (reserved), and optional `workStartTime`/`workEndTime` (HH:MM strings) defining the employee's daily working window
- **Auto-assignment**: when creating an order, the system selects the first available employee (working hours cover the order window, no conflicting active orders) and stores `assignedEmployeeId` on the order
- **Zero-profile fallback**: branches without profiles (or profiles without configured hours) behave exactly as before — no capacity reduction

### Order Lifecycle

Status state machine with enforced transitions:

```
BOOKED_PENDING_CONFIRMATION → BOOKED, CANCELLED
BOOKED → IN_PROGRESS, CANCELLED, NO_SHOW
IN_PROGRESS → COMPLETED, CANCELLED
COMPLETED / CANCELLED / NO_SHOW → (terminal)
```

Creation flow: validate services → calculate price/duration → enforce workingDays + maxAdvanceBookingDays → `$transaction` (auto-assign work post with lock + auto-assign employee with buffer) → dispatch domain event. Restore validates scheduling conflicts before un-deleting non-terminal orders.

### Domain Events & Side Effects

Built on NestJS `EventEmitter2`. Events: `ORDER_CREATED`, `ORDER_STATUS_CHANGED`, `ORDER_CANCELLED`, `CLIENT_DELETED`, `PAYMENT_RECEIVED`, `BOOKING_CONFIRMED`.

Subscribers (async): audit logging, WebSocket broadcasting, BullMQ job queueing.

### Realtime

Socket.IO on `/events` namespace. JWT auth on handshake. Auto-join `tenant:{id}` rooms. Domain events bridged to WS broadcasts.

### Background Jobs

3 BullMQ queues: `notifications`, `analytics`, `booking-confirmations`. Exponential backoff retries (3 attempts).

### Idempotency

- **Service-level** (Orders, Public Booking): check + lock + save inside `Serializable $transaction`
- **Interceptor-level** (Payments): `IdempotencyInterceptor` reads `Idempotency-Key` header
- Race handling: `INSERT ... ON CONFLICT DO NOTHING` — first wins, second gets `409`
- 24h TTL, hourly cleanup cron

### Soft Delete

7 models: User, Client, Order, Vehicle, Service, Branch, Role.

- Auto-filtered via `TenantPrismaService.$extends` on all read operations
- `_includeDeleted: true` bypass flag | `?includeDeleted=true` query param
- Partial unique indexes: `WHERE deleted_at IS NULL` for re-creating after delete
- `PATCH /:id/restore` endpoints on all 7 models
- Daily cron at 2 AM hard-deletes records older than 30 days

### Public Booking

Rate-limited `@Public()` endpoints for customer-facing booking. Resolves tenant by slug, checks `allowOnlineBooking`. Delegates to internal services (zero duplication). Soft-deleted vehicles/clients filtered from lookups. TOCTOU failures surface as user-friendly "slot unavailable" messages.

### Global Middleware

`helmet()` | `cookieParser()` | CORS | `ValidationPipe` (whitelist, forbidNonWhitelisted) | `AllExceptionsFilter` | `PrismaExceptionFilter` (P2002→409, P2025→404) | `TransformInterceptor` (response envelope)

### Response Envelope

```json
// Single resource
{ "data": { ... }, "meta": { "timestamp": "..." } }

// Paginated
{ "data": { "items": [...], "meta": { "total": 100, "page": 1, "limit": 20, "totalPages": 5 } } }
```

---

## Frontend

### Screens

#### Authenticated

| Route | Page | Description |
|-------|------|-------------|
| `/` | Dashboard | KPI cards, live ops panel, revenue chart, branch/employee performance, alerts, online booking stats |
| `/orders` | Orders | Table/card toggle, status/branch filters, search, pagination |
| `/orders/create` | Create Order | 6-step wizard: client → vehicle → services → worker → time slot → review; slot resets on service/worker change; availability cache invalidated on mutations |
| `/orders/:id` | Order Detail | Status transitions, services, client/vehicle info, delete/restore |
| `/clients` | Clients | Search (name/phone), create dialog, pagination |
| `/clients/:id` | Client Detail | Inline edit, vehicles list, quick info sidebar, delete/restore |
| `/vehicles` | Vehicles | Create dialog with client combobox |
| `/services` | Services | Inline edit/delete, active/inactive badges, sort order |
| `/branches` | Branches | Create dialog |
| `/branches/:id` | Branch Detail | Work posts sub-list, inline edit, delete/restore |
| `/work-posts` | Work Posts | Branch selector filter, create dialog |
| `/users` | Users | Create/edit dialogs, role + branch display |
| `/roles` | Roles | Create dialog, permission count |
| `/roles/:id` | Role Detail | Inline edit, permission assignment UI, delete/restore |
| `/analytics` | Analytics | Revenue + services charts, branch/date filters |
| `/audit` | Audit Log | Filterable by action/entity/date, color-coded badges |
| `/workforce` | Workforce | Employee profiles with working hours (Start/End Time); create, edit, activate/deactivate |
| `/how-to` | How To (Wiki) | In-app help: 11 reference topics + 4 step-by-step flows (New Client Call, Online Booking, New Employee, Branch Setup), TOC sidebar, EN + UK |

#### Public

| Route | Page | Description |
|-------|------|-------------|
| `/login` | Login | Email/password form |
| `/public/:slug` | Public Booking | 4-step customer booking wizard |

### Cross-Cutting

- **i18n**: English + Ukrainian, namespace-based
- **Dark/Light theme**: persisted toggle
- **Permission gates**: `PermissionGate` component hides unauthorized actions
- **Responsive**: all layouts adapt mobile → desktop
- **Soft delete UX**: badges, include-deleted toggles, restore buttons
- **Global search** (Cmd+K): searches clients, orders, and services in parallel with type badges and icons
- **Route-level auth guard**: `RequireAuth` wrapper redirects unauthenticated users to `/login` with return-to state
- **Error boundaries**: root-level + page-level `ErrorBoundary` with "Try Again" / "Go to Dashboard" recovery
- **Enhanced pagination**: page numbers with ellipsis, first/last page buttons, page size selector (10/20/50/100)
- **Password management**: self-service change password (Header), admin reset password per user (UsersPage)
- **In-app wiki** ("How To"): data-driven help system — 11 reference topics + 4 step-by-step flows with numbered steps and location badges; TOC sidebar with Topics/Flows sections; i18n `how-to` namespace
- Skeleton loaders, confirm dialogs for destructive actions

---

## Database Schema

**17 models, 5 enums.** All UUIDs, timestamps. Soft-delete on 7 models with auto-filtering.

### Enums

| Enum | Values |
|------|--------|
| `OrderStatus` | BOOKED, BOOKED_PENDING_CONFIRMATION, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW |
| `OrderSource` | INTERNAL, WEB, WIDGET, API |
| `PaymentStatus` | PENDING, PAID, PARTIALLY_PAID, REFUNDED, FAILED |
| `PaymentMethod` | CASH, CARD, ONLINE, OTHER |
| `AuditAction` | CREATE, UPDATE, DELETE, STATUS_CHANGE, MERGE |

### Models

| Model | Key Details |
|-------|-------------|
| **Tenant** | Unique slug, settings JSON, 1:1 BookingSettings |
| **BookingSettings** | Slot duration, buffer, working hours/days, online booking toggle |
| **Branch** | Per-tenant, has many WorkPosts, soft-delete |
| **User** | Unique email per tenant, soft-delete, optional Role + Branch |
| **Role** | Unique name per tenant, M:N Permissions, soft-delete |
| **RolePermission** | Join table for Role ↔ Permission M:N |
| **Permission** | Global (no tenantId), seeded `module.action` pairs |
| **Client** | Unique phone per tenant, soft-delete |
| **Vehicle** | Linked to Client, make (required), licensePlate (optional), soft-delete |
| **Service** | Name, duration, price (decimal), sortOrder, soft-delete |
| **WorkPost** | Bay per Branch |
| **EmployeeProfile** | Links User to Branch; `isWorker`, `efficiencyCoefficient`, `active`, optional `workStartTime`/`workEndTime` (HH:MM); unique per userId |
| **Order** | Status state machine, scheduling window, all entity relations; optional `assignedEmployeeId` |
| **OrderService** | Price snapshot at booking time |
| **Payment** | Amount, method, status, linked to Order |
| **AuditLog** | Entity type/id, action, old/new values, performer |
| **IdempotencyKey** | Tenant-scoped, unique `(tenantId, key)`, TTL-based expiry |

### Indexes

- **Order**: `(tenantId, status)`, `(tenantId, workPostId, scheduledStart, scheduledEnd)`
- **All models**: indexed on `tenantId`
- **IdempotencyKey**: `@@index([expiresAt])` for cron cleanup
- **Partial uniques** (soft-delete aware, `WHERE deletedAt IS NULL`):
  `users(tenantId, email)` | `clients(tenantId, phone)` | `vehicles(tenantId, licensePlate)` | `roles(tenantId, name)`

---

## API Reference

All endpoints prefixed with `/api/v1`. Protected by JWT unless marked Public.
**82 endpoints** (76 protected, 6 public) across 16 controllers.

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | Public | Returns access + refresh tokens |
| POST | `/auth/refresh` | Public | Refresh tokens |
| PATCH | `/auth/change-password` | JWT | User changes own password (verifies current password) |

### CRUD Resources

Standard pattern: `GET /` | `GET /:id` | `POST /` | `PATCH /:id` | `DELETE /:id` (soft) | `PATCH /:id/restore`

| Resource | Permission prefix | Notes |
|----------|-------------------|-------|
| `/tenants` | `tenants.*` | No delete/restore |
| `/users` | `users.*` | + `PATCH /:id/reset-password` (admin resets any user's password) |
| `/roles` | `roles.*` | + `POST /:id/permissions` |
| `/branches` | `branches.*` | + `GET /:id/booking-settings`, `PATCH /:id/booking-settings` |
| `/clients` | `clients.*` | Searchable; + `POST /merge` |
| `/vehicles` | `vehicles.*` | Filterable by clientId |
| `/services` | `services.*` | |
| `/work-posts` | `work-posts.*` | No delete/restore, requires `?branchId` |

### Permissions (JWT only)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/permissions` | List all |
| GET | `/permissions/:module` | List by module |

### Orders

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/orders` | orders.read | List (filterable by status, date, branch) |
| GET | `/orders/availability` | scheduling.read | Available time slots |
| GET | `/orders/:id` | orders.read | Details |
| POST | `/orders` | orders.create | Create (idempotent via `Idempotency-Key`) |
| PATCH | `/orders/:id/status` | orders.update | Status transition |
| DELETE | `/orders/:id` | orders.delete | Soft delete |
| PATCH | `/orders/:id/restore` | orders.update | Restore |

### Payments

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/orders/:orderId/payments` | payments.read | List for order |
| POST | `/orders/:orderId/payments` | payments.create | Record (idempotent) |

### Analytics

All endpoints require `analytics.view` permission. Params: `dateFrom`, `dateTo`, `branchId` (optional).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/analytics/dashboard` | Summary stats (total orders, revenue, clients, completion rate) |
| GET | `/analytics/revenue` | Revenue breakdown by date range |
| GET | `/analytics/services` | Most popular services by order count |
| GET | `/analytics/kpi` | Today's KPIs: revenue, orders, avg duration, cancel rate, active clients, occupancy |
| GET | `/analytics/live` | Real-time: in-progress, waiting, free work posts, overdue orders |
| GET | `/analytics/branches` | Per-branch revenue, orders, avg check, load rate |
| GET | `/analytics/employees` | Per-employee orders, revenue, cancel rate |
| GET | `/analytics/alerts` | Business anomalies: high cancel rate, revenue drop, booking decline |
| GET | `/analytics/online-booking` | Order source breakdown (INTERNAL / WEB / WIDGET / API) |

### Workforce

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/workforce/profiles` | workforce.read | List employee profiles (paginated) |
| GET | `/workforce/profiles/:id` | workforce.read | Single profile |
| POST | `/workforce/profiles` | workforce.create | Create profile (one per user) |
| PATCH | `/workforce/profiles/:id` | workforce.update | Update profile |
| DELETE | `/workforce/profiles/:id` | workforce.delete | Delete (must be inactive first) |

### Audit

| Method | Path | Description |
|--------|------|-------------|
| GET | `/audit-logs` | Filterable by entity, action, date range |

### Public Booking (rate-limited, no auth)

| Method | Path | Limit | Description |
|--------|------|-------|-------------|
| GET | `/public/booking/:slug/availability` | 10/min | Time slots |
| GET | `/public/booking/:slug/services` | 10/min | Active services |
| GET | `/public/booking/:slug/branches` | 10/min | Active branches |
| POST | `/public/booking/:slug/book` | 3/min | Create booking (idempotent) |

### WebSocket

Namespace `/events` | JWT auth on handshake | Rooms: `tenant:{id}`, `branch:{id}`
Events: `order.created`, `order.status_changed`, `order.cancelled`

---

## Project Structure

### Backend

```
src/
├── main.ts                          # Bootstrap
├── app.module.ts                    # Root module
├── config/                          # Zod-validated env config
├── prisma/                          # PrismaService, TenantPrismaService
├── common/
│   ├── decorators/                  # @CurrentUser, @CurrentTenant, @Permissions, @Public
│   ├── guards/                      # JwtAuthGuard, PermissionsGuard, TenantGuard
│   ├── filters/                     # AllExceptionsFilter, PrismaExceptionFilter
│   ├── interceptors/                # TransformInterceptor
│   ├── events/                      # DomainEvent, EventDispatcherService
│   ├── types/                       # JwtPayload, AuthenticatedRequest
│   └── utils/                       # PaginationDto, helpers
└── modules/
    ├── auth/                        # Login, refresh, change-password, JWT strategies
    ├── tenants/                     # CRUD (super-admin)
    ├── users/                       # CRUD + soft-delete
    ├── roles/                       # CRUD + soft-delete + permission assignment
    ├── permissions/                 # Read-only (seeded)
    ├── branches/                    # CRUD + soft-delete
    ├── clients/                     # CRUD + soft-delete + search
    ├── vehicles/                    # CRUD + soft-delete
    ├── services/                    # CRUD + soft-delete
    ├── work-posts/                  # CRUD
    ├── scheduling/                  # Availability + row-level locking + workforce cap
    ├── workforce/                   # EmployeeProfile CRUD (working hours on profile)
    ├── orders/                      # Order lifecycle + idempotency + employee auto-assign
    ├── payments/                    # Payment recording + idempotency
    ├── analytics/                   # Dashboard + reports
    ├── audit/                       # Event-driven audit logs
    ├── public-booking/              # Public-facing booking API
    ├── realtime/                    # Socket.IO gateway
    ├── jobs/                        # BullMQ producers + processors
    ├── idempotency/                 # Keys, interceptor, cron
    └── cleanup/                     # Hard-delete cron (30-day retention)
```

Module convention:
```
module-name/
├── module-name.module.ts
├── module-name.controller.ts
├── module-name.service.ts
├── module-name.repository.ts        # Prisma queries only
├── module-name.service.spec.ts
└── dto/
    ├── create-*.dto.ts
    └── update-*.dto.ts
```

### Frontend

```
frontend/src/
├── main.tsx
├── app/
│   ├── App.tsx                      # Root + providers
│   ├── router.tsx                   # Lazy-loaded routes
│   ├── providers.tsx                # QueryClient, ThemeProvider
│   ├── layout/                      # DashboardLayout, PublicLayout, Sidebar, Header
│   └── pages/                       # 404, 403
├── features/
│   ├── auth/                        # LoginPage, API, hooks
│   ├── dashboard/                   # StatsCards, RevenueChart
│   ├── orders/                      # OrdersPage, CreateOrderPage, OrderDetailPage
│   ├── clients/                     # ClientsPage, ClientDetailPage, ClientForm
│   ├── vehicles/                    # VehiclesPage
│   ├── services/                    # ServicesPage, ServiceForm
│   ├── branches/                    # BranchesPage, BranchDetailPage
│   ├── work-posts/                  # WorkPostsPage
│   ├── users/                       # UsersPage, UserForm
│   ├── roles/                       # RolesPage, RoleDetailPage, PermissionAssignment
│   ├── analytics/                   # Charts, stats
│   ├── audit/                       # AuditPage
│   ├── workforce/                   # WorkforcePage (employee profiles)
│   ├── public-booking/              # PublicBookingPage
│   └── how-to/                      # In-app wiki (HowToLayout, TopicSidebar, TopicContent)
├── shared/
│   ├── api/client.ts                # Axios + interceptors + refresh
│   ├── components/                  # DataTable, PageHeader, PermissionGate, ConfirmDialog, RequireAuth, ErrorBoundary, GlobalSearch
│   ├── ui/                          # button, input, dialog, card, badge, combobox, skeleton
│   ├── stores/auth.store.ts         # Zustand (tokens, user, permissions)
│   ├── hooks/                       # useDebounce, useSocket, usePermissions
│   ├── types/                       # models.ts, api.ts, auth.ts
│   ├── constants/permissions.ts
│   └── utils/                       # cn, format (currency, duration, time)
└── i18n/locales/{en,uk}/            # Namespace-based translations
```

---

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Prisma Client Extensions for tenant isolation + soft-delete | Transparent ORM-layer injection — zero chance of missing filters |
| Repository pattern | Separates Prisma queries from business logic; only repositories touch the ORM |
| Stateless JWT (no DB table for refresh tokens) | Horizontal scaling without session store; trade-off: no server-side revocation |
| `SELECT FOR UPDATE` in Serializable transactions | Prevents double-booking at the database level |
| Domain events via EventEmitter2 | Decouples side effects (audit, WS, jobs) from core logic |
| BullMQ for background jobs | Redis-backed, exponential backoff retries, job prioritization |
| Global JWT guard + `@Public()` | Secure-by-default — new endpoints are auto-protected |
| Hybrid idempotency (service + interceptor) | Service-level for transactional endpoints, interceptor for simple ones |
| Partial unique indexes | `WHERE deleted_at IS NULL` — re-use unique fields after soft-delete |
| Feature-based folder structure | Self-contained features, scales without cross-feature coupling |
| i18n from day one | EN + UK translations; namespace-based for lazy loading |
| Permission gates in UI | `PermissionGate` component matches backend RBAC |
| Workforce separate from RBAC | `EmployeeProfile` is an operational layer (who is on shift) — User/Role/Permission tables remain unchanged; branches without profiles get legacy behavior automatically |
| Employee auto-assignment inside Serializable tx | Assigned inside the same lock that reserves the slot — eliminates TOCTOU race between capacity check and assignment |

---

## Seed Data Details

The seed script (`prisma/seed.ts`) creates a demo environment simulating **1 year of operations**. Run via `npx prisma db seed`. Idempotent (skips if data exists).

### Entities

| Entity | Count | Details |
|--------|-------|---------|
| Tenant | 1 | `WashFlow Demo` (slug: `demo`) |
| Permissions | 47 | `module.action` pairs across 14 modules (includes workforce.create/read/update/delete) |
| Branches | 3 | Центральний (4 posts), Лівобережний (3), Подільський (4) |
| Services | 8 | Експрес мийка (15 min / 250 UAH) → Керамічне покриття (120 min / 3500 UAH) |
| Roles | 4 | Admin + Менеджер + Оператор + Рецепціоніст |
| Staff | 18 | 6 + 5 + 7 per branch |
| Clients | 250 | Ukrainian names/phones, 60% with email |
| Vehicles | ~400 | 1-3 per client, 10 makes, Ukrainian plates |
| Orders | ~2,600 | Day-by-day slot filling, zero conflicts |
| Payments | ~1,800 | COMPLETED orders: 40% CASH / 50% CARD / 10% ONLINE |
| Audit Logs | ~4,800 | CREATE + STATUS_CHANGE entries |

### Order Generation Logic

- **Period**: today - 365 days → today, skipping Sundays
- **Seasonal demand**: Jan 0.6x → Jul 1.5x → Dec 0.55x
- **Slot filling**: tracks `nextAvailableTime` per post per day (08:00-19:00), guarantees zero scheduling conflicts
- **Status**: past 70% COMPLETED / 12% CANCELLED / 5% NO_SHOW; recent more varied; future BOOKED
- **Sources**: 60% INTERNAL / 20% WEB / 15% WIDGET / 5% API
