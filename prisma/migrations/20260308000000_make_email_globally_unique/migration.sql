-- Drop the per-tenant unique constraint (created by prisma db push / migrate dev)
DROP INDEX IF EXISTS "users_tenantId_email_key";

-- Drop the non-unique composite index (created by init migration)
DROP INDEX IF EXISTS "users_tenantId_email_idx";

-- Email is now globally unique
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
