# Features

What WashFlow does, and every screen that exposes it. Product-level view — for the code, see
[modules.md](./modules.md) and [frontend.md](./frontend.md); for exact routes, see
[reference.md](./reference.md).

**Entry point:** [README.md](./README.md)

---

## Backend capabilities

| Capability              | Summary                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Multi-tenant CRUD       | Tenants, users, roles, permissions, branches, work posts, services, clients, vehicles                                                                  |
| Order management        | State machine, transactional slot reservation, workforce auto-assignment, idempotent creation, restore                                                 |
| Scheduling              | Slot generation from booking settings, buffer handling, work-post + workforce capacity, `FOR UPDATE` locking                                           |
| Workforce               | `EmployeeProfile` per user with working hours; drives availability and auto-assignment                                                                 |
| Payments                | Decimal payment totals; order-row locking prevents concurrent overpayment; idempotent via `idempotency-key`                                                                                            |
| Analytics               | Dashboard summary, KPIs, live operations, revenue, popular services, per-branch and per-employee stats, anomaly alerts, online-booking mix, CSV export |
| Audit                   | Event-driven, append-only log with entity/action/date filtering                                                                                        |
| Subscriptions & billing | Plan catalogue, usage and limits, add-ons, Paddle checkout + webhooks, trial lifecycle                                                                 |
| Public booking          | Two `@Public()` surfaces (tenant slug and `x-carwash-tenant-id` header) over one service                                                               |
| Realtime                | Socket.IO `/events` namespace, JWT handshake, tenant/branch rooms                                                                                      |
| Background jobs         | Three BullMQ queues with retry/backoff; email side effects                                                                                             |
| Idempotency             | Service-level (orders, booking) and interceptor-level (payments), 24 h TTL, hourly cleanup                                                             |
| Soft delete + cleanup   | Nine models, restore endpoints, daily hard-delete cron                                                                                                 |
| Operational endpoints   | `GET /health` (PostgreSQL, Redis, BullMQ), `GET /metrics` (Prometheus, token-guarded)                                                                  |
| Support                 | `POST /support` — public, 3/min, relays to Telegram, works anonymously                                                                                 |
| API docs                | Swagger UI at `/api/docs` — **non-production only**                                                                                                    |

---

## Operator dashboard — authenticated screens

All under `/` → `AppShell` → `DashboardLayout` → `SubscriptionGate`.

| Route                   | Page           | What it does                                                                                                                                       |
| ----------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/dashboard`            | Dashboard      | KPI cards, live operations panel, revenue chart, branch and employee performance tables, alerts, online-booking chart                              |
| `/orders`               | Orders         | Orders table/cards with status and branch filters and pagination, plus a schedule view (work posts × time slots) that links into the create wizard |
| `/orders/create`        | Create Order   | Multi-step wizard — branch/client, vehicle, services, time slot, worker, review. Accepts URL prefill from the schedule view                        |
| `/orders/:id`           | Order Detail   | Status transitions, service list, client/vehicle info, payments, delete/restore                                                                    |
| `/clients`              | Clients        | Search, create dialog, pagination, merge dialog                                                                                                    |
| `/clients/:id`          | Client Detail  | Inline edit, vehicles, delete/restore                                                                                                              |
| `/vehicles`             | Vehicles       | List + create dialog with a client combobox                                                                                                        |
| `/vehicles/:id`         | Vehicle Detail | Single-vehicle view                                                                                                                                |
| `/services`             | Services       | Inline edit/delete, active badge, sort order                                                                                                       |
| `/branches`             | Branches       | List + create dialog                                                                                                                               |
| `/branches/:id`         | Branch Detail  | Inline edit, work posts, booking-settings form, delete/restore                                                                                     |
| `/work-posts`           | Work Posts     | Branch filter, create dialog                                                                                                                       |
| `/users`                | Users          | Create/edit dialogs, role + branch, admin password reset                                                                                           |
| `/roles`                | Roles          | List + create dialog with permission counts                                                                                                        |
| `/roles/:id`            | Role Detail    | Permission assignment UI                                                                                                                           |
| `/analytics`            | Analytics      | Revenue and popular-services charts with date/branch filters                                                                                       |
| `/audit`                | Audit Log      | Filter by action, entity and date; colour-coded badges                                                                                             |
| `/workforce`            | Workforce      | Employee profiles with working hours; create, edit, activate/deactivate                                                                            |
| `/subscription`         | Subscription   | Plan/status badges, usage cards, trial banner, add-on manager, cancel. **Requires `tenants.read`**                                                 |
| `/subscription/plans`   | Plans          | Tier cards, monthly/yearly toggle, Paddle checkout. **Requires `tenants.read`**                                                                    |
| `/subscription/billing` | Billing        | Billing summary and transaction history. **Requires `tenants.read`**                                                                               |
| `/how-to`               | How-To (wiki)  | Redirects to `/how-to/getting-started`; 12 reference topics + 5 step-by-step flows, TOC sidebar, EN + UK                                           |
| `/how-to/:topicSlug`    | How-To topic   | Individual topic or flow                                                                                                                           |
| `/403`, `/404`, `*`     | Error pages    | `*` redirects to `/404`                                                                                                                            |

Only the three `/subscription*` routes are wrapped in a router-level `PermissionGate`. Every
other dashboard route is reachable by any authenticated user; the backend enforces
`@Permissions` per endpoint, and `PermissionGate` hides individual actions inside pages.

---

## Public and marketing screens

| Route                | Page              | Notes                                                                                         |
| -------------------- | ----------------- | --------------------------------------------------------------------------------------------- |
| `/`                  | Landing           | Rendered by `AppShell` for **everyone** — authenticated users are not redirected away         |
| `/login`             | Login             | Email + password; link to forgot-password                                                     |
| `/register`          | Registration      | Creates tenant + Admin role + first user + 30-day trial in one transaction, then auto-logs in |
| `/forgot-password`   | Forgot Password   | Always reports success (no email enumeration)                                                 |
| `/reset-password`    | Reset Password    | Reads `?token=` from the URL                                                                  |
| `/public/:slug`      | Public Landing    | Services showcase for one car wash                                                            |
| `/public/:slug/book` | Public Booking    | Customer booking wizard                                                                       |
| `/blog`              | Blog list         | Markdown posts bundled at build time (`frontend/content/blog/`, 27 files, EN + UK)            |
| `/blog/:slug`        | Blog post         | Article + JSON-LD                                                                             |
| `/legal`             | →`/legal/privacy` | Redirect                                                                                      |
| `/legal/privacy`     | Privacy Policy    |                                                                                               |
| `/legal/terms`       | Terms of Service  |                                                                                               |
| `/legal/refund`      | Refund Policy     |                                                                                               |

When an unauthenticated visitor hits any non-landing dashboard route, `AppShell` opens the login
modal and navigates back to `/`.

---

## Standalone booking widget

`frontend-booking/` is a separate app, one build per car wash.

- Tenant identity comes from `VITE_TENANT_ID` (validated as a UUID at module load — the app
  throws if it is missing or malformed) and is sent as the `x-carwash-tenant-id` header.
- **One route** (`/`) rendering a **3-step** wizard: _services_ (branch + services + date/time) →
  _your info_ (contact + vehicle) → _confirm_.
- Talks only to `/api/v1/public/widget/{services,branches,availability,book}`; bookings carry a
  fresh `idempotency-key`.
- Dev server on port 5174, proxying `/api` to `http://localhost:3003`.
- No auth, no sockets, no Sentry, no theme toggle. EN/UK toggle in the header.

Both public booking surfaces return only the confirmation allow-list and currently submitted
contact/vehicle fields; matching CRM identity never exposes stored personal data. Their wizards
reset slot selection on tenant/branch/services/date changes, prevent progression with stale
selection, and reject old selections after delayed validation or availability responses.
Details: [frontend.md](./frontend.md#booking-widget-frontend-booking).

---

## Cross-cutting frontend behaviour

Quota limits for branches, work posts, users and services apply atomically to create and
restore. Order restore shares create's resource reservation; it cannot double-book a post or
employee. Employee shifts use branch-local time across DST transitions. Account/access-scope
changes immediately clear dashboard query/mutation caches and invalidate old responses.

| Feature          | Behaviour                                                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| i18n             | English + Ukrainian, 18 namespaces, all bundled statically in `i18n/index.ts`                                                                                |
| Theme            | Persisted light/dark toggle (`theme.store.ts`)                                                                                                               |
| Permission gates | `PermissionGate` hides actions; mirrors backend RBAC but is not the authority                                                                                |
| Global search    | Queries `/clients`, `/orders` and `/services` in parallel and renders type-badged results                                                                    |
| Toasts           | `sonner`; every mutation error surfaces through `QueryClient.defaultOptions.mutations.onError` (401/403 get a deliberately generic message)                  |
| Auth routing     | `AppShell` — landing for everyone at `/`, login modal + redirect for protected routes                                                                        |
| Trial gate       | `SubscriptionGate` redirects to `/subscription` on expired trial (or shows a blocking card without `tenants.read`); super admins bypass; fails open on error |
| Realtime refresh | `useSocket` invalidates TanStack Query caches on order and payment events                                                                                    |
| Token handling   | Access token in memory only; refresh token in an httpOnly cookie; queued 401 refresh-and-retry                                                               |
| Resilience       | Root, per-route and gate-level `ErrorBoundary`; skeleton loaders; confirm dialogs                                                                            |
| Support          | Floating `SupportButton` posting to `POST /support`                                                                                                          |
| Soft-delete UX   | `IncludeDeletedToggle` + `SoftDeleteBadge` on list pages that support restore                                                                                |
| SEO              | `Seo` component (helmet + JSON-LD) plus a post-build per-route `<head>` prerender script                                                                     |

---

Related: [frontend.md](./frontend.md) · [reference.md](./reference.md) ·
[business-logic.md](./business-logic.md)
