# WashFlow — Tests

## Quick Start

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

## Coverage Report

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full test coverage breakdown (1 383 tests across 100 files).

## E2E Helpers

All backend E2E tests use shared helpers from `test/helpers/test-app.ts`:

- `createTestApp(slug)` — spins up NestJS app, creates isolated tenant + admin, returns auth tokens
- `cleanupTenant(prisma, tenantId, app)` — FK-safe cleanup + app close
- `deleteTenantData(prisma, tenantId)` — FK-safe tenant data deletion (multi-tenant tests)
- `createLimitedUser(prisma, opts)` — non-superAdmin user with specific permissions
- `loginAs(app, tenantId, email)` — login any user, returns JWT tokens
- `nextWorkday(hour, daysAhead)` — future UTC date skipping Sundays
