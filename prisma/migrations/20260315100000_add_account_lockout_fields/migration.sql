-- AlterTable
ALTER TABLE "users" ADD COLUMN "failed_login_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "account_locked_until" TIMESTAMPTZ;
