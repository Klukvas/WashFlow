# Features

Backend capabilities and every frontend screen. Part of the [context set](./README.md) ·
source of truth: [`OVERVIEW.md`](../../OVERVIEW.md).

## Backend capabilities

- Multi-tenant CRUD for tenants, users, roles, permissions, branches, clients, vehicles,
  services, work posts.
- Order management with a state machine, scheduling, workforce auto-assignment, and
  idempotent creation.
- Payments (record + idempotent), analytics/reporting with CSV export, event-driven audit
  log.
- Subscription & billing (Paddle), workforce profiles, public booking (slug + widget),
  realtime gateway.
- Background jobs, idempotency keys, soft-delete + cleanup cron, health checks, Prometheus
  metrics.
- **Support**: `POST /support` — a `@Public()`, rate-limited (3/min) endpoint that accepts
  `subject` / `message` / optional `email`; works for both authenticated and anonymous users
  (falls back to `anonymous` tenant/user).

## Operator Dashboard — authenticated screens

| Route | Page | Description |
|-------|------|-------------|
| `/dashboard` | Dashboard | KPI cards, live ops panel, revenue chart, branch/employee performance, alerts, online-booking stats |
| `/orders` | Orders | Two tabs: **Orders** (table/card toggle, status/branch filters, pagination) and **Schedule** (availability grid: rows = work posts, cols = 30-min slots; click a free slot → prefilled create wizard) |
| `/orders/create` | Create Order | Wizard with 3 start modes: Client-first, Time-first, Service-first. Supports URL prefill (`branchId`, `workPostId`, `date`, `time`) from the schedule tab |
| `/orders/:id` | Order Detail | Status transitions, services, client/vehicle info, delete/restore |
| `/clients`, `/clients/:id` | Clients | Search (name/phone), create dialog, pagination; detail with inline edit, vehicles list, delete/restore |
| `/vehicles` | Vehicles | Create dialog with client combobox |
| `/services` | Services | Inline edit/delete, active/inactive badges, sort order |
| `/branches`, `/branches/:id` | Branches | Create dialog; detail with work-posts sub-list, inline edit, delete/restore |
| `/work-posts` | Work Posts | Branch selector filter, create dialog |
| `/users` | Users | Create/edit dialogs, role + branch display |
| `/roles`, `/roles/:id` | Roles | Create dialog, permission count; detail with permission assignment UI |
| `/analytics` | Analytics | Revenue + services charts, branch/date filters |
| `/audit` | Audit Log | Filterable by action/entity/date, color-coded badges |
| `/workforce` | Workforce | Employee profiles with working hours; create, edit, activate/deactivate |
| `/subscription` | Subscription | Plan/status badges, usage cards with progress bars, trial banner, add-on manager, cancel; admin-only |
| `/subscription/plans` | Plans | 3 tiers, monthly/yearly toggle, pricing cards, Paddle checkout |
| `/subscription/billing` | Billing | Billing details / history view |
| `/how-to` | How-To (Wiki) | In-app help: 11 reference topics + 4 step-by-step flows, TOC sidebar, EN + UK |

## Public & marketing screens

| Route | Page | Description |
|-------|------|-------------|
| `/` | Landing | Hero, features, pricing; guests see this, authenticated users redirect to `/dashboard` |
| `/login` | Login | Email/password + "Forgot password?" link |
| `/register` | Registration | Creates tenant + admin user + trial subscription in one transaction, auto-login |
| `/forgot-password` | Forgot Password | Email form → reset link; always shows success (no info leak) |
| `/reset-password` | Reset Password | Token from URL, new-password form → redirect to login |
| `/public/:slug` | Public Booking | 4-step customer booking wizard |
| `/blog`, `/blog/:slug` | Blog | Content-marketing / SEO articles (list + post), data-loaded via `blog-loader` |
| `/legal/privacy` | Privacy Policy | Legal page |
| `/legal/terms` | Terms of Service | Legal page |
| `/legal/refund` | Refund Policy | Legal page |

## Standalone Booking Widget

`frontend-booking/` is a separate public app deployed per car-wash. Tenant identity comes
from the `VITE_TENANT_ID` env var → sent as the `x-carwash-tenant-id` header. Dev server on
port 5174. Routes: `/` (services showcase + Book Now) and `/book` (4-step wizard: branch →
schedule → info → review). No auth, no sockets, no Sentry.

## Cross-cutting frontend

- **i18n**: English + Ukrainian, namespace-based (lazy-loadable).
- **Dark/Light theme**: persisted toggle.
- **Permission gates**: `PermissionGate` hides unauthorized actions, mirroring backend RBAC.
- **Global search** (Cmd+K): searches clients, orders, and services in parallel with type
  badges.
- **Global toasts**: `sonner` Toaster; all mutation errors (403 limit reached, validation,
  …) surface automatically via `QueryClient.defaultOptions.mutations.onError`.
- **Auth routing**: `AppShell` shows the landing page at `/` for guests, redirects
  authenticated users to `/dashboard`; inner routes require auth via `RequireAuth`.
- **Trial-expiry gate**: `SubscriptionGate` in `DashboardLayout` redirects all routes to
  `/subscription` when a trial expires (except `/subscription/*`); super admins bypass.
- **Support button** floats in-app and posts to `POST /support`.
- **Resilience**: root + page-level `ErrorBoundary` with "Try Again" / "Go to Dashboard";
  skeleton loaders; confirm dialogs; enhanced pagination (page numbers, first/last, size
  selector).
