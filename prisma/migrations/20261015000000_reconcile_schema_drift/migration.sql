-- Atomic maintenance migration: table rewrites/index builds take write locks.
-- Legacy Prisma/adapter-pg reads TIMESTAMP values as UTC. Preserve that same
-- instant explicitly, independent of the migration connection's TimeZone.
BEGIN;
SET LOCAL lock_timeout = '10s';

-- Do not discard either photo value if an installation has both spellings.
-- Fail before any schema/data changes so that the ambiguity can be reconciled.
DO $$
DECLARE
  legacy_photo boolean;
  current_photo boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'vehicles' AND column_name = 'photo_url'),
    EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'vehicles' AND column_name = 'photoUrl')
    INTO legacy_photo, current_photo;
  IF legacy_photo AND current_photo THEN
    RAISE EXCEPTION 'vehicles has both photo_url and photoUrl; reconcile the two columns before deploying';
  ELSIF legacy_photo THEN
    ALTER TABLE "vehicles" RENAME COLUMN "photo_url" TO "photoUrl";
  ELSIF NOT current_photo THEN
    RAISE EXCEPTION 'vehicles photo column is missing; expected photo_url or photoUrl';
  END IF;
END $$;

ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'Europe/Kyiv';

-- Group changes per table to avoid rewriting each table for every column.
-- Already-TIMESTAMPTZ columns must never be reinterpreted through AT TIME ZONE.
DO $$
DECLARE
  change record;
BEGIN
  FOR change IN
    SELECT columns.table_name,
      string_agg(format('ALTER COLUMN %I TYPE TIMESTAMPTZ USING %I AT TIME ZONE %L',
        columns.column_name, columns.column_name, 'UTC'), ', ' ORDER BY columns.ordinal_position) AS alterations
    FROM information_schema.columns AS columns
    JOIN (VALUES
      ('tenants', 'createdAt'),
      ('tenants', 'updatedAt'),
      ('branches', 'createdAt'),
      ('branches', 'updatedAt'),
      ('branches', 'deletedAt'),
      ('users', 'createdAt'),
      ('users', 'updatedAt'),
      ('users', 'deletedAt'),
      ('roles', 'createdAt'),
      ('roles', 'updatedAt'),
      ('roles', 'deletedAt'),
      ('clients', 'createdAt'),
      ('clients', 'updatedAt'),
      ('clients', 'deletedAt'),
      ('vehicles', 'createdAt'),
      ('vehicles', 'updatedAt'),
      ('vehicles', 'deletedAt'),
      ('services', 'createdAt'),
      ('services', 'updatedAt'),
      ('services', 'deletedAt'),
      ('permissions', 'createdAt'),
      ('work_posts', 'createdAt'),
      ('work_posts', 'updatedAt'),
      ('orders', 'scheduledStart'),
      ('orders', 'scheduledEnd'),
      ('orders', 'createdAt'),
      ('orders', 'updatedAt'),
      ('orders', 'deletedAt'),
      ('payments', 'createdAt'),
      ('payments', 'updatedAt'),
      ('audit_logs', 'createdAt'),
      ('idempotency_keys', 'createdAt'),
      ('idempotency_keys', 'expiresAt'),
      ('employee_profiles', 'createdAt'),
      ('employee_profiles', 'updatedAt')
    ) AS legacy(table_name, column_name)
      ON columns.table_name = legacy.table_name AND columns.column_name = legacy.column_name
    WHERE columns.table_schema = current_schema()
      AND columns.data_type = 'timestamp without time zone'
    GROUP BY columns.table_name
  LOOP
    EXECUTE format('ALTER TABLE %I %s', change.table_name, change.alterations);
  END LOOP;
END $$;

-- Defaults affect future omitted limits only; existing explicit limits stay intact.
ALTER TABLE "subscriptions"
  ALTER COLUMN "maxUsers" DROP DEFAULT,
  ALTER COLUMN "maxBranches" DROP DEFAULT,
  ALTER COLUMN "maxWorkPosts" DROP DEFAULT,
  ALTER COLUMN "maxServices" DROP DEFAULT;

CREATE INDEX IF NOT EXISTS "users_tenantId_roleId_idx" ON "users"("tenantId", "roleId");
CREATE INDEX IF NOT EXISTS "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");
CREATE INDEX IF NOT EXISTS "orders_tenantId_clientId_idx" ON "orders"("tenantId", "clientId");
CREATE INDEX IF NOT EXISTS "orders_tenantId_vehicleId_idx" ON "orders"("tenantId", "vehicleId");
CREATE INDEX IF NOT EXISTS "orders_tenantId_assignedEmployeeId_idx" ON "orders"("tenantId", "assignedEmployeeId");
CREATE INDEX IF NOT EXISTS "order_services_orderId_idx" ON "order_services"("orderId");
CREATE INDEX IF NOT EXISTS "order_services_serviceId_idx" ON "order_services"("serviceId");
-- Keep the existing order_services tenant index and subscriptions trial partial
-- index; both are now represented in schema.prisma instead of dropped as drift.
COMMIT;
