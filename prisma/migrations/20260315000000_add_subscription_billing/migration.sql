-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('TRIAL', 'STARTER', 'BUSINESS', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED');

-- AlterTable: add new columns with defaults for backward compatibility
ALTER TABLE "subscriptions"
  ADD COLUMN "planTier" "PlanTier" NOT NULL DEFAULT 'TRIAL',
  ADD COLUMN "billingInterval" "BillingInterval",
  ADD COLUMN "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
  ADD COLUMN "paddlePriceId" TEXT,
  ADD COLUMN "currentPeriodStart" TIMESTAMPTZ,
  ADD COLUMN "cancelledAt" TIMESTAMPTZ,
  ADD COLUMN "cancelEffectiveAt" TIMESTAMPTZ;

-- Make limit columns nullable (existing non-null values are preserved)
ALTER TABLE "subscriptions"
  ALTER COLUMN "maxUsers" DROP NOT NULL,
  ALTER COLUMN "maxBranches" DROP NOT NULL,
  ALTER COLUMN "maxWorkPosts" DROP NOT NULL,
  ALTER COLUMN "maxServices" DROP NOT NULL;

-- CreateTable
CREATE TABLE "subscription_addons" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "paddlePriceId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "subscription_addons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_addons_subscriptionId_resource_key" ON "subscription_addons"("subscriptionId", "resource");

-- AddForeignKey
ALTER TABLE "subscription_addons" ADD CONSTRAINT "subscription_addons_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
