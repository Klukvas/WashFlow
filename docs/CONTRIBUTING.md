# Contributing to WashFlow

## Prerequisites

- **Node.js** 20+
- **pnpm** (enabled via corepack: `corepack enable`)
- **Docker** & **Docker Compose** (for local infrastructure)
- **PostgreSQL** 16 (or use Docker)
- **Redis** 7 (or use Docker)

## Development Environment Setup

### 1. Install dependencies

```bash
# Backend
pnpm install

# Frontend
cd frontend && pnpm install
```

### 2. Start infrastructure

```bash
# Spin up PostgreSQL + Redis for local development
docker compose -f docker-compose.dev.yml up -d
```

This starts:
- PostgreSQL on `localhost:5432` (db: `washflow_dev`, user: `postgres`, password: `postgres`)
- Redis on `localhost:6379`

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` — see the [Environment Variables](#environment-variables) section below.

### 4. Set up the database

```bash
# Run migrations
npx prisma migrate dev

# Seed with initial data
pnpm seed
```

### 5. Start the development servers

```bash
# Backend (with hot reload) — from project root
pnpm start:dev

# Frontend (from frontend/ directory)
cd frontend && pnpm dev
```

The backend listens on `http://localhost:3000` and the frontend dev server on `http://localhost:5173` (Vite default).

---

## Available Scripts

<!-- AUTO-GENERATED -->
### Backend (project root)

| Command | Description |
|---------|-------------|
| `pnpm build` | Compile TypeScript with `nest build` |
| `pnpm start` | Start compiled server |
| `pnpm start:dev` | Start with hot reload (watch mode) |
| `pnpm start:debug` | Start with hot reload + Node.js inspector |
| `pnpm start:prod` | Run production build from `dist/` |
| `pnpm format` | Auto-format all `src/**/*.ts` files with Prettier |
| `pnpm lint` | Lint and auto-fix `src/**/*.ts` with ESLint |
| `pnpm test` | Run unit test suite (Jest) |
| `pnpm test:watch` | Run unit tests in watch mode |
| `pnpm test:cov` | Run unit tests with coverage report |
| `pnpm test:debug` | Run tests with Node.js inspector attached |
| `pnpm test:e2e` | Run end-to-end test suite |
| `pnpm seed` | Seed the database via `prisma/seed.ts` |
| `pnpm db:reset` | Reset the database and re-run all migrations |

### Frontend (`frontend/` directory)

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Vite development server with HMR |
| `pnpm build` | Type-check + production build |
| `pnpm preview` | Preview production build locally |
| `pnpm lint` | Lint with ESLint |
| `pnpm test` | Run unit tests (Vitest, single run) |
| `pnpm test:watch` | Run unit tests in interactive watch mode |
<!-- END AUTO-GENERATED -->

---

## Environment Variables

<!-- AUTO-GENERATED -->
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string |
| `REDIS_URL` | **Yes** | — | Redis connection string |
| `JWT_ACCESS_SECRET` | **Yes** | — | JWT access token signing secret (min 32 chars) |
| `JWT_REFRESH_SECRET` | **Yes** | — | JWT refresh token signing secret (min 32 chars) |
| `JWT_ACCESS_EXPIRATION` | No | `15m` | Access token lifetime (e.g. `15m`, `1h`) |
| `JWT_REFRESH_EXPIRATION` | No | `7d` | Refresh token lifetime (e.g. `7d`, `30d`) |
| `PORT` | No | `3000` | HTTP server port |
| `NODE_ENV` | No | `development` | Runtime environment: `development`, `production`, `test` |
| `CORS_ORIGINS` | No | `*` | Allowed CORS origins (comma-separated or `*`) |

**Example values** (from `.env.example`):
```
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
REDIS_URL="redis://HOST:PORT"
JWT_ACCESS_SECRET="your-access-secret-min-32-characters-long"
JWT_REFRESH_SECRET="your-refresh-secret-min-32-characters-long"
JWT_ACCESS_EXPIRATION="15m"
JWT_REFRESH_EXPIRATION="7d"
PORT=3000
NODE_ENV="development"
CORS_ORIGINS="*"
```
<!-- END AUTO-GENERATED -->

---

## Testing

### Running Tests

```bash
# Backend unit tests
pnpm test

# Backend unit tests with coverage
pnpm test:cov

# Backend E2E tests
pnpm test:e2e

# Frontend unit tests
cd frontend && pnpm test
```

### Writing Tests

**Backend (Jest + NestJS Testing)**

- Unit test files live next to their source: `*.spec.ts`
- Use `Test.createTestingModule()` to wire up NestJS modules
- Mock dependencies with `jest.fn()` — never use real databases
- Follow TDD: write the test first, then implement

**Frontend (Vitest + React Testing Library)**

- Test files co-located with components: `*.test.tsx`
- Use `@testing-library/react` for component tests
- Mock API calls — avoid real network requests in unit tests

### Coverage Requirements

- **Minimum**: 80% statement coverage
- All services are at 100% coverage
- Common infrastructure (guards, filters, interceptors, utils) at 100%

---

## Code Style

### Linting & Formatting

The project uses **ESLint** + **Prettier** for consistent style.

```bash
# Fix all lint issues in backend
pnpm lint

# Format all backend TypeScript files
pnpm format
```

Pre-commit: run `pnpm lint && pnpm format` before committing.

### Conventions

- **Immutability**: Always return new objects, never mutate in place
- **Files**: 200–400 lines typical, 800 max — extract utilities when exceeding
- **Functions**: Keep under 50 lines
- **Error handling**: Explicit at every level, user-friendly messages in UI code
- **Input validation**: All user input validated via class-validator DTOs at the controller layer
- **No hardcoded secrets**: Use `.env` — never commit secrets

---

## Pull Request Checklist

- [ ] Tests pass: `pnpm test`
- [ ] No lint errors: `pnpm lint`
- [ ] Backend build succeeds: `pnpm build`
- [ ] Frontend build succeeds: `cd frontend && pnpm build`
- [ ] New code has test coverage ≥ 80%
- [ ] No hardcoded secrets or credentials
- [ ] PR description explains the **why**, not just the what
