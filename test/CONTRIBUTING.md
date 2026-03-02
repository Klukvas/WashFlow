# WashFlow — Test Coverage Report

> Last updated: 2026-02-24

## Summary

| Metric | Value |
|--------|-------|
| **Total test files** | 106 |
| **Total test cases** | 1 424 |
| **Backend unit tests** | 81 files / 1 039 tests |
| **Backend E2E (API)** | 11 files / 299 tests |
| **Frontend unit tests** | 5 files / 30 tests |
| **Frontend E2E (UI)** | 9 files / 56 tests |
| **Line coverage** | 84.97 % |
| **Statement coverage** | 84.30 % |
| **Function coverage** | 90.34 % |
| **Branch coverage** | 75.29 % |

---

## Test Types

### 1. Backend Unit Tests (Jest)

Isolated tests with mocked dependencies. Each service, controller, and repository has its own spec file.

**Run:** `pnpm test`

| Area | Files | Tests | What is covered |
|------|------:|------:|-----------------|
| **Common / Decorators** | 4 | 13 | `@CurrentBranch`, `@CurrentTenant`, `@CurrentUser`, `@Permissions` |
| **Common / Filters** | 2 | 56 | `AllExceptionsFilter` (HttpException, Prisma errors, prod vs dev), `PrismaExceptionFilter` (P2002, P2025, FK) |
| **Common / Guards** | 3 | 34 | `JwtAuthGuard`, `PermissionsGuard` (superAdmin bypass, permission matching), `TenantGuard` |
| **Common / Interceptors** | 1 | 20 | `TransformInterceptor` — response envelope, pagination unwrap |
| **Common / Events** | 2 | 33 | `DomainEvent`, `EventDispatcherService` |
| **Common / Utilities** | 3 | 50 | `bookingSettings` cascade logic, `branchScope` filtering, `pagination` builder + meta |
| **Analytics** | 3 | 97 | Controller routing, repository queries (dashboard, revenue, KPI, live, branches, employees, alerts, online-booking), service delegation |
| **Audit** | 4 | 34 | Controller, repository, service, event subscriber |
| **Auth** | 4 | 43 | Login (valid/invalid), refresh tokens, JWT strategies, password hashing |
| **Branches** | 3 | 55 | CRUD, booking settings upsert, soft delete/restore |
| **Clients** | 3 | 52 | CRUD, merge logic, vehicle deduplication |
| **Cleanup** | 1 | 15 | Scheduled stale-data cleanup |
| **Idempotency** | 4 | 37 | Key generation, interceptor duplicate detection, cleanup scheduler |
| **Jobs (BullMQ)** | 7 | 26 | Event subscribers, producers (analytics, booking-confirmation, notification), processors |
| **Orders** | 3 | 79 | Creation, status transitions, pricing calculation, scheduling conflicts |
| **Payments** | 3 | 18 | Create (CASH, CARD), list by order, validation |
| **Permissions** | 3 | 20 | List all, filter by module, seeding |
| **Public Booking** | 2 | 34 | Public availability, booking flow, vehicle lookup |
| **Realtime (WebSocket)** | 3 | 18 | Gateway join/leave, service broadcast, event subscriber |
| **Roles** | 3 | 42 | CRUD, permission assignment (replace-all), soft delete/restore |
| **Scheduling** | 2 | 32 | Slot availability, overlap detection, buffer time, working hours |
| **Services** | 3 | 44 | CRUD, pricing, duration |
| **Tenants** | 3 | 42 | CRUD, multi-tenant isolation |
| **Users** | 3 | 44 | CRUD, role assignment, permission aggregation |
| **Vehicles** | 3 | 27 | CRUD, client association, deduplication |
| **Workforce** | 3 | 36 | Employee profiles, shift management, availability queries |
| **Work Posts** | 3 | 38 | CRUD, branch isolation, activation |

### 2. Backend E2E Tests — API (Jest + Supertest)

Full HTTP request/response tests against a real NestJS app instance with a real PostgreSQL database. Each suite creates an isolated tenant and cleans up after itself.

**Run:** `pnpm test:e2e` (or `npx jest --config test/jest-e2e.json --runInBand`)

| File | Tests | What is covered |
|------|------:|-----------------|
| `app.e2e-spec.ts` | 2 | App bootstrap, global auth guard |
| `auth.e2e-spec.ts` | 9 | Login, token refresh, JWT validation, input validation |
| `clients.e2e-spec.ts` | 10 | Client CRUD, vehicle management |
| `orders.e2e-spec.ts` | 2 | Order creation, order lifecycle |
| `users.e2e-spec.ts` | 11 | User CRUD, role assignment, permissions |
| `vehicles.e2e-spec.ts` | 11 | Vehicle CRUD, client association, dedup |
| `scheduling-flows.e2e-spec.ts` | 30 | 12 scheduling flows (see details below) |
| `scheduling-slots-deep.e2e-spec.ts` | 67 | Deep slot logic (see details below) |
| `critical-modules.e2e-spec.ts` | 79 | 9 module sections (see details below) |
| `security.e2e-spec.ts` | 29 | Multi-tenant isolation, permission enforcement, branch scoping (see details below) |
| `business-rules.e2e-spec.ts` | 49 | Status transitions, public booking, audit, analytics, services, cleanup, idempotency (see details below) |

#### scheduling-flows.e2e-spec.ts (30 tests, 12 flows)

| Flow | Tests | Scenario |
|------|------:|----------|
| 1 | 5 | Order creation lifecycle |
| 2 | 4 | Time slot conflicts |
| 3 | 3 | Worker-specific conflicts |
| 4 | 2 | Auto-assign work posts |
| 5 | 1 | Cancel frees slot |
| 6 | 2 | Restore conflicts |
| 7 | 4 | Business rules (working days, max advance) |
| 8 | 3 | Status transitions |
| 9 | 2 | Multi-duration services |
| 10 | 2 | Public booking flow |
| 11 | 1 | Workforce capacity |
| 12 | 1 | Idempotent order creation |

#### scheduling-slots-deep.e2e-spec.ts (67 tests, Flows 13-43)

| Flows | Tests | Scenario |
|-------|------:|----------|
| 13-15 | 8 | Buffer boundary precision (exact boundary, 1-minute gap) |
| 16-18 | 7 | Worker work hours enforcement |
| 19-21 | 8 | Terminal status (COMPLETED/CANCELLED/NO_SHOW) frees slot |
| 22-24 | 7 | Employee buffer precision |
| 25-27 | 7 | Availability API accuracy (matches order creation) |
| 28-30 | 6 | Concurrent order limits (race conditions) |
| 31-33 | 8 | Multi-hour service edge cases |
| 34-36 | 6 | Work post closure impact on availability |
| 37-39 | 5 | Shift availability enforcement |
| 40 | 3 | Explicit `assignedEmployeeId` with busy worker |
| 41 | 2 | Concurrent worker exhaustion (P2034 handling) |
| 42 | 2 | Public booking error translation |
| 43 | 4 | Booking settings fallback to hardcoded defaults |

#### critical-modules.e2e-spec.ts (79 tests, 9 sections)

| Section | Tests | What is covered |
|---------|------:|-----------------|
| Payments | 5 | Create CASH/CARD, list by order, reject invalid amount/method |
| Roles & Permissions | 13 | Full CRUD, permission assign/replace/clear, soft delete/restore, 404 |
| Workforce / Profiles | 10 | Create (dup -> 409), list/filter, update, deactivate, active filter, 404 |
| Branches & Booking Settings | 12 | CRUD, booking settings upsert, HH:MM validation, slot min, soft delete/restore |
| Work Posts | 6 | Create, list by branch, update, deactivate, 404 |
| Client Merge | 7 | Merge with overrides, source soft-deleted, vehicle dedup (AB1234), unique vehicle moved, order re-pointed, same-target rejected |
| Auth Edge Cases | 9 | Refresh token, invalid token, wrong-type token, change password, login failures, 401 on protected endpoints |
| Analytics | 10 | All 9 endpoints (dashboard, revenue, services, KPI, live, branches, employees, alerts, online-booking) + branchId filter |
| Client Soft Delete / Restore | 5 | Delete -> 404 -> restore -> 400 on re-restore -> visible again |

#### security.e2e-spec.ts (29 tests, 3 sections)

| Section | Tests | What is covered |
|---------|------:|-----------------|
| Multi-Tenant Isolation | 10 | Cross-tenant order/client/payment access blocked (404), listing excludes other tenant data |
| Permission Enforcement | 13 | No-perm user blocked (403), orders-only user scoped, superAdmin bypasses all |
| Branch Scoping | 6 | Branch-scoped user sees only own branch, cross-branch create/update blocked, admin sees all |

#### business-rules.e2e-spec.ts (49 tests, 7 sections)

| Section | Tests | What is covered |
|---------|------:|-----------------|
| Order Status Transitions | 17 | All valid/invalid transitions: BOOKED, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW, BOOKED_PENDING_CONFIRMATION |
| Public Booking Edge Cases | 6 | Online booking toggle, client/vehicle reuse by phone/plate, new client creation, non-existent slug |
| Audit Log Integration | 5 | ORDER_CREATED, STATUS_CHANGE, CANCELLED with reason, CLIENT_DELETED, multiple entries |
| Analytics Correctness | 6 | Dashboard totals, revenue, completion rate, KPI orders/cancel rate, alerts format |
| Services CRUD | 9 | Create, list, get, update, soft delete, restore, restore non-deleted, invalid data, non-existent |
| Cleanup Service | 3 | Hard-delete > 30 days, preserve < 30 days, FK chain cleanup |
| Idempotency on Payments | 3 | Same key cached, different keys separate, no key allows duplicates |

### 3. Frontend Unit Tests (Vitest + Testing Library)

**Run:** `cd frontend && pnpm test`

| File | Tests | What is covered |
|------|------:|-----------------|
| `auth.store.test.ts` | 6 | JWT parsing, permission extraction, login/logout state, localStorage |
| `format.test.ts` | 6 | Currency formatting (UAH), duration (hours/minutes), edge cases |
| `idempotency.test.ts` | 3 | Key generation, deduplication |
| `order-status.test.ts` | 7 | Status constants, transitions, terminal status checks |
| `PermissionGate.test.tsx` | 8 | Permission-based rendering, component visibility |

### 4. Frontend E2E Tests — UI (Playwright)

Browser-based tests with authenticated sessions via global setup.

**Run:** `cd frontend && pnpm e2e`

| File | Tests | What is covered |
|------|------:|-----------------|
| `login.spec.ts` | 5 | Login form, success redirect, failed login, email/UUID validation |
| `clients.spec.ts` | 4 | Client list navigation, creation flow, row click to detail |
| `orders.spec.ts` | 6 | Order list, Create Order button, navigation, 6-step wizard indicators |
| `dashboard.spec.ts` | 8 | KPI cards (revenue, orders, duration, cancel rate, clients, occupancy), stats cards, live operations, branch/employee performance, alerts |
| `order-detail.spec.ts` | 6 | Order info display, status transition buttons (BOOKED/COMPLETED), service list with total price, schedule times, back navigation |
| `order-create-wizard.spec.ts` | 5 | Branch selector, client search (+380 prefix), search results, vehicle step navigation, full 6-step wizard flow to review |
| `users.spec.ts` | 6 | User list, create dialog, form validation (required fields), table columns, cancel dialog |
| `roles.spec.ts` | 8 | Role list, create button, role names in table, role detail navigation, edit form + permissions, permission checkboxes, back navigation, save button state |
| `public-booking.spec.ts` | 8 | Public page (no auth), location selector, services display, date/time step, contact form (firstName/lastName/phone/licensePlate), full 4-step booking flow, invalid slug handling |

---

## Coverage Highlights

### Fully covered (100 % line coverage)

- All decorators
- All guards
- All interceptors
- Event system (DomainEvent + EventDispatcher)
- Pagination utilities
- Booking settings utilities

### Well covered (> 80 %)

- All module services (auth, orders, clients, scheduling, etc.)
- All controllers
- All repositories

### Known gaps

| Area | Coverage | Reason |
|------|----------|--------|
| `main.ts` / `app.module.ts` | 0 % | Bootstrap / DI container — tested implicitly via E2E |
| Configuration (`config/`) | 0 % | Environment-dependent, loaded at startup |
| `TenantPrismaService` | ~6 % | Multi-tenant proxy — tested implicitly via E2E |
| `PrismaService` | ~36 % | DB connection lifecycle |
| DTO class-validator rules | partial | Validated via E2E (400 responses), not unit-tested in isolation |

---

## How to Run

```bash
# Backend unit tests
pnpm test

# Backend unit tests with coverage
pnpm test:cov

# Backend E2E tests (requires running PostgreSQL + Redis)
npx jest --config test/jest-e2e.json --runInBand --forceExit

# Frontend unit tests
cd frontend && pnpm test

# Frontend E2E tests (requires running dev server)
cd frontend && pnpm e2e
```

---

## Test Infrastructure

### Backend E2E helpers (`test/helpers/test-app.ts`)

- `createTestApp(slug)` — spins up NestJS app, creates isolated tenant + admin user, returns auth tokens
- `cleanupTenant(prisma, tenantId, app)` — deletes all tenant data in FK-safe order, closes app
- `deleteTenantData(prisma, tenantId)` — deletes all tenant-scoped data in FK-safe order (used for multi-tenant tests)
- `createLimitedUser(prisma, opts)` — creates a non-superAdmin user with specific permissions via role
- `loginAs(app, tenantId, email)` — logs in any user and returns JWT tokens
- `nextWorkday(hour, daysAhead)` — returns a future UTC date skipping Sundays
- Handles stale data from previous failed runs automatically

### Frontend E2E setup (`frontend/e2e/global-setup.ts`)

- Authenticates a test user via Playwright
- Saves browser storage state for reuse across tests
- Configurable via environment variables
