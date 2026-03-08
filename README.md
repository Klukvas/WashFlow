# WashFlow

Multi-tenant car wash management SaaS.

## Quick Start

```bash
# Install dependencies
pnpm install
cd frontend && pnpm install && cd ..

# Start infrastructure (PostgreSQL + Redis)
docker compose up -d postgres redis

# Apply migrations & seed
pnpm prisma migrate deploy
pnpm prisma db seed

# Start backend (dev) — http://localhost:3003
pnpm run start:dev

# Start frontend (dev) — http://localhost:5173
cd frontend && pnpm run dev
```

## Seed Login Credentials

| Field       | Value                                    |
|-------------|------------------------------------------|
| Email       | `admin@washflow.com`                     |
| Password    | `admin123`                               |

## Tech Stack

- **Backend:** NestJS, Prisma, PostgreSQL, Redis
- **Frontend:** React, Vite, TailwindCSS, React Query
- **Package Manager:** pnpm
