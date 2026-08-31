# Infrastructure, Architecture & Patterns

Tech stack, the decisions behind it, and how the code is organized. Part of the
[context set](./README.md) · source of truth: [`OVERVIEW.md`](../../OVERVIEW.md).

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
| Password hashing | Argon2 |
| Rate limiting | @nestjs/throttler |
| Logging | nestjs-pino + pino-http + pino-loki (Grafana Cloud) |
| Monitoring | prom-client (Prometheus) + Sentry |
| Email | Resend SDK |

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

**Infrastructure**: pnpm · Docker + Docker Compose · TypeScript 5.x (strict).

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Prisma Client Extensions for tenant isolation + soft-delete | Transparent ORM-layer injection — zero chance of missing filters |
| Repository pattern | Separates Prisma queries from business logic; only repositories touch the ORM |
| Stateless JWT (no refresh-token table) | Horizontal scaling without a session store; trade-off: no server-side revocation |
| `SELECT FOR UPDATE` in Serializable transactions | Prevents double-booking at the database level |
| Domain events via EventEmitter2 | Decouples side effects (audit, WS, jobs) from core logic |
| BullMQ for background jobs | Redis-backed, exponential backoff, job prioritization |
| Global JWT guard + `@Public()` | Secure-by-default — new endpoints are auto-protected |
| Hybrid idempotency (service + interceptor) | Service-level for transactional endpoints, interceptor for simple ones |
| Partial unique indexes | `WHERE deleted_at IS NULL` — re-use unique fields after soft-delete |
| Feature-based folder structure | Self-contained features; scales without cross-feature coupling |
| i18n from day one | EN + UK; namespace-based for lazy loading |
| Per-route meta prerender (`frontend/scripts/prerender-meta.mjs`) | Post-build Node script writes `dist/<route>/index.html` with correct per-route head (title/description/canonical/OG/Article-JSON-LD) for public routes, so social scrapers & non-JS crawlers don't get homepage meta on every URL. No React render, no nginx change; runs in `pnpm build`. |
| Workforce separate from RBAC | `EmployeeProfile` is an operational layer; User/Role/Permission tables unchanged |
| Employee auto-assignment inside the Serializable tx | Assigned inside the same lock that reserves the slot — eliminates TOCTOU race |
| Subscription limits optional | No subscription row → no limits (backward compat); null = unlimited |
| Paddle Billing integration | Webhook-driven lifecycle; backend is source of truth; HMAC-verified; Redis-idempotent |
| Email service (Resend) | `@Global()`, no-op without API key; best-effort (never throws); templates as pure functions |
| Account lockout on User model | 5 attempts / 30 min — account-level rate limiting without Redis |
| CSV export utility | Simple `toCsv()` with proper escaping — no external library; streamed via `res.end()` |
| Vehicle photo upload | Multer `diskStorage` to `./uploads/vehicles/`; served at `/uploads`; 5MB, image/* only |
| Health checks | `/api/v1/health` pings PostgreSQL + Redis; used by LBs / orchestrators |
| Prometheus metrics | `/api/v1/metrics` — request histograms, counters, Node defaults; global interceptor |
| Sentry integration | Errors + performance traces; PII disabled in prod; sample rate via env |
| Grafana Cloud Loki | `pino-loki` ships structured logs via HTTP push; no agents; no-op without env |

## Global Middleware & Response Envelope

**Middleware chain**: `helmet()` · `cookieParser()` · CORS · `ValidationPipe` (whitelist,
forbidNonWhitelisted) · `AllExceptionsFilter` · `PrismaExceptionFilter` (P2002 → 409,
P2025 → 404) · `TransformInterceptor` (response envelope). A 30s server-level request
timeout prevents hanging requests from exhausting connections.

**Response envelope** (every endpoint):

```json
// Single resource
{ "data": { }, "meta": { "timestamp": "..." } }

// Paginated
{ "data": { "items": [],
            "meta": { "total": 100, "page": 1, "limit": 20, "totalPages": 5 } } }
```

## Project Structure

### Backend (`src/`)

```
src/
├── main.ts                 # Bootstrap
├── app.module.ts           # Root module
├── config/                 # Zod-validated env config
├── prisma/                 # PrismaService, TenantPrismaService
├── common/                 # decorators, guards, filters, interceptors, events, types, utils
└── modules/
    ├── auth, email, health, metrics, tenants, users, roles, permissions
    ├── branches, clients, vehicles, services, work-posts
    ├── subscriptions, scheduling, workforce, orders, payments
    ├── analytics, audit, public-booking, realtime, jobs
    ├── idempotency, cleanup, support
```

**Module convention**: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.repository.ts`
(Prisma queries only), `*.service.spec.ts`, and `dto/` (`create-*.dto.ts`,
`update-*.dto.ts`).

### Frontend (`frontend/src/`)

```
frontend/src/
├── main.tsx
├── app/        # App, router (lazy routes), providers, layout, error pages
├── features/   # auth, dashboard, orders, clients, vehicles, services,
│               #  branches, work-posts, users, roles, analytics, audit,
│               #  workforce, subscription, payments, landing, public-booking,
│               #  how-to, blog, legal, support
├── shared/     # api/client (axios + refresh), components, ui, stores (Zustand),
│               #  hooks, lib (Sentry), types, constants, utils
└── i18n/locales/{en,uk}/
```
