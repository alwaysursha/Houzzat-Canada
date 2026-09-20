-- Admin-managed Agent professional identity (additive only).
-- Canonical cellphone remains User.phone + User.phoneE164.
-- AgentProfile.phone stays as display copy for CMA / signatures.
-- WorkspaceInvite snapshot lets activation skip re-entry of Admin-managed fields.
-- No production data backfill. Demo Agent rows are not rewritten.

ALTER TABLE "AgentProfile"
  ADD COLUMN IF NOT EXISTS "firstName" TEXT,
  ADD COLUMN IF NOT EXISTS "lastName" TEXT,
  ADD COLUMN IF NOT EXISTS "recoLicenseNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "recoLicenseExpiresAt" TIMESTAMP(3);

ALTER TABLE "WorkspaceInvite"
  ADD COLUMN IF NOT EXISTS "firstName" TEXT,
  ADD COLUMN IF NOT EXISTS "lastName" TEXT,
  ADD COLUMN IF NOT EXISTS "phone" TEXT,
  ADD COLUMN IF NOT EXISTS "recoLicenseNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "recoLicenseExpiresAt" TIMESTAMP(3);
