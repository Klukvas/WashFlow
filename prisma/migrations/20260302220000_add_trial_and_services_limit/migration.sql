-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "maxServices" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "subscriptions" ADD COLUMN "isTrial" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "subscriptions" ADD COLUMN "trialEndsAt" TIMESTAMPTZ;

-- Partial index for trial expiry queries
CREATE INDEX "subscriptions_trialEndsAt_idx"
  ON "subscriptions" ("trialEndsAt")
  WHERE "isTrial" = true AND "trialEndsAt" IS NOT NULL;
