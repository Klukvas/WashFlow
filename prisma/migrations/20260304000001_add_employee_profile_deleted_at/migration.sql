-- Add missing deletedAt column to employee_profiles
ALTER TABLE "employee_profiles" ADD COLUMN "deletedAt" TIMESTAMPTZ;
