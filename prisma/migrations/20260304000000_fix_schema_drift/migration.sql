-- Add missing deletedAt column to work_posts
ALTER TABLE "work_posts" ADD COLUMN "deletedAt" TIMESTAMPTZ;

-- Add missing tenantId column to order_services
ALTER TABLE "order_services" ADD COLUMN "tenantId" TEXT;

-- Backfill tenantId from the related order
UPDATE "order_services" os
SET "tenantId" = o."tenantId"
FROM "orders" o
WHERE os."orderId" = o.id;

-- Make tenantId NOT NULL after backfill
ALTER TABLE "order_services" ALTER COLUMN "tenantId" SET NOT NULL;

-- Add FK constraint and index
ALTER TABLE "order_services" ADD CONSTRAINT "order_services_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX "order_services_tenantId_idx" ON "order_services"("tenantId");
