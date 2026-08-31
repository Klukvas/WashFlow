# WashFlow — Context for AI Agents

Fast-onboarding context for anyone (human or AI agent) working on **WashFlow**, a
multi-tenant car-wash CRM. Read this page first, then jump to the section you need.

> **Source of truth is [`OVERVIEW.md`](../../OVERVIEW.md)** at the project root.
> These files re-organize that content into focused, load-only-what-you-need docs.
> After any business-logic or feature change, update `OVERVIEW.md` **and** the relevant
> file here.

## The set

| Doc | What's inside |
|-----|---------------|
| [business-logic.md](./business-logic.md) | Domain rules: multi-tenancy, RBAC, scheduling, workforce, order lifecycle, billing, idempotency, soft-delete, events |
| [features.md](./features.md) | Backend capabilities + every frontend screen (dashboard, public, marketing, booking widget) |
| [architecture.md](./architecture.md) | Tech stack, architecture decisions, middleware, response envelope, project structure |
| [reference.md](./reference.md) | Env vars, database schema, full API reference, seed data |

## What WashFlow is

A dockerized full-stack TypeScript app:

- **Backend** — `src/` (NestJS 11 + Prisma 7, PostgreSQL 16, Redis 7, Socket.IO)
- **Operator dashboard** — `frontend/` (React 19 + Vite + TailwindCSS 4)
- **Customer booking widget** — `frontend-booking/` (standalone, deployed per car-wash)

Data is isolated per tenant at the **ORM layer**, so most business rules are enforced in
the database and service layers — not just the UI.

## Golden rules for agents

- **Multi-tenancy is automatic.** `TenantPrismaService` auto-injects `tenantId` and
  auto-filters `deletedAt: null`. Don't hand-write `tenantId` filters in repositories.
- **Secure-by-default.** A global `JwtAuthGuard` protects every route; opt out with
  `@Public()`. Permissions: `@Permissions('module.action')` + `PermissionsGuard`.
- **Repository pattern + immutability.** Only repositories touch Prisma; business logic
  depends on their interfaces. Prefer new objects over mutation.
- **`pnpm` only** — the lockfile is `pnpm-lock.yaml`.
- **Dev servers run in tmux** (a hook enforces it) so logs stay accessible.

## Run it

```bash
pnpm install
cp .env.example .env            # edit DB/Redis credentials
npx prisma generate
npx prisma migrate deploy       # apply migrations
npx prisma db seed              # prints Tenant ID (save it for login)

pnpm start:dev                  # backend  -> http://localhost:3000
cd frontend && pnpm dev         # frontend -> http://localhost:5173

# Docker
docker compose up                            # full stack
docker compose -f docker-compose.dev.yml up  # DB + Redis only
```

## Demo credentials

The login form requires **Email** and **Password** (email is globally unique — one email
maps to one tenant).

| Account | Email | Password | Permissions |
|---------|-------|----------|-------------|
| Super Admin | `admin@washflow.com` | `admin123` | All (47 permissions) |
| Staff Users | `<name>@washflow.com` | `password123` | Role-scoped |

Staff emails are transliterated Ukrainian names (e.g. `oleksandr.marchenko@washflow.com`).
First user per branch is **Manager**, the rest are **Operator** / **Receptionist**.
