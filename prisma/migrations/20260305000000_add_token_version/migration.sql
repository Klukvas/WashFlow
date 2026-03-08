-- Add tokenVersion to users for refresh token revocation
ALTER TABLE "users" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
