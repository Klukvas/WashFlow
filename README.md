# WashFlow

Multi-tenant car wash management SaaS — NestJS + Prisma backend, React operator dashboard, and a
standalone customer booking widget.

## Documentation

| I want to…                                    | Go to                                                                                                     |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Understand the codebase and start working** | **[docs/context/README.md](docs/context/README.md)** — the canonical entry point for humans and AI agents |
| Get a high-level product/system summary       | [OVERVIEW.md](OVERVIEW.md)                                                                                |
| Set up, run tests, open a PR, deploy          | [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)                                                              |

`docs/context/` holds the detailed, maintained documentation: architecture, backend modules,
data model, frontend, infrastructure, business logic, API reference, and an agent playbook.
Runtime code is always the ultimate source of truth — see the
[source-of-truth hierarchy](docs/context/README.md#4-source-of-truth-hierarchy).

## Quick Start

```bash
# 1. Dependencies (pnpm — three separate lockfiles)
pnpm install                                 # backend (root)
cd frontend && pnpm install && cd ..         # operator dashboard
cd frontend-booking && pnpm install && cd .. # booking widget — needed for step 5

# 2. Infrastructure (PostgreSQL + Redis)
docker compose -f docker-compose.dev.yml up -d

# 3. Environment
cp .env.example .env      # fill DATABASE_URL, REDIS_URL and the two JWT secrets
                          # set PORT=3003 to match the Vite dev proxy (see note below)

# 4. Database
npx prisma generate
npx prisma migrate deploy
npx prisma db seed        # optional demo data

# 5. Run
pnpm start:dev                    # backend
cd frontend && pnpm dev           # dashboard → http://localhost:5173
cd frontend-booking && pnpm dev   # booking widget → http://localhost:5174
```

> **Port note.** `PORT` defaults to `3000`, but `frontend/vite.config.ts` and
> `frontend-booking/vite.config.ts` proxy `/api` to `http://localhost:3003` (as does the CI
> Playwright job). Set `PORT=3003` locally, or change the proxy targets.

API base path is `/api/v1`. Swagger UI is served at `/api/docs` when `NODE_ENV !== 'production'`.

## Seed Login Credentials

| Account     | Email                 | Password      |
| ----------- | --------------------- | ------------- |
| Super admin | `admin@washflow.com`  | `admin123`    |
| Staff       | `<name>@washflow.com` | `password123` |

Demo values only — created by `prisma/seed.ts`. Email is globally unique, so no tenant selector
is needed at login.

## Tech Stack

- **Backend:** NestJS 11, Prisma 7, PostgreSQL 16, Redis 7 (BullMQ), Socket.IO, Passport JWT
- **Frontend:** React 19, Vite, TailwindCSS 4, TanStack Query, Zustand, React Router 7
- **Ops:** Docker Compose, GitHub Actions, Prometheus metrics, Sentry, Grafana Loki
- **Package manager:** pnpm

## Repository layout

```
src/                 NestJS backend (modules, common, config, prisma)
prisma/              schema.prisma · migrations/ · seed.ts
frontend/            operator dashboard (React + Vite + nginx image)
frontend-booking/    standalone booking widget (React + Vite)
test/                backend E2E specs
docs/context/        agent-facing documentation  ← start here
```

Full map: [docs/context/README.md](docs/context/README.md#5-repository-map).
