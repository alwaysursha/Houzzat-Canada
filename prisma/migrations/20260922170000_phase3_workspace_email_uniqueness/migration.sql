-- Phase 3 — strict workspace email uniqueness (DO NOT auto-apply in this PR wave).
-- Local schema only until production cutover order is executed deliberately.
--
-- Target:
--   UNIQUE (workspaceId, email) WHERE workspaceId IS NOT NULL
--   UNIQUE (email) WHERE workspaceId IS NULL
--   UNIQUE (workspaceId, provider, providerAccountId) WHERE workspaceId IS NOT NULL
--   UNIQUE (provider, providerAccountId) WHERE workspaceId IS NULL
--
-- Prerequisites before APPLY on production:
--   1. Phase 2 backfill complete (51 Users assigned)
--   2. App code supporting workspace-scoped auth already deployed OR deployed in same window
--   3. Omer split prepared (duplicate email requires this migration first, then split)
-- See scripts/identity-phase3-omer-split.ts header for full cutover order.

-- Drop global User.email uniqueness
DROP INDEX IF EXISTS "User_email_key";

-- Partial unique: one email per tenant workspace
CREATE UNIQUE INDEX "User_workspaceId_email_tenant_key"
  ON "User" ("workspaceId", "email")
  WHERE "workspaceId" IS NOT NULL;

-- Partial unique: one email among NULL-workspace (platform / orphans)
CREATE UNIQUE INDEX "User_email_null_workspace_key"
  ON "User" ("email")
  WHERE "workspaceId" IS NULL;

-- Keep a non-unique email index for operational lookups
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User" ("email");

-- Account: drop global OAuth uniqueness; replace with workspace-scoped partials
DROP INDEX IF EXISTS "Account_provider_providerAccountId_key";

CREATE UNIQUE INDEX "Account_workspace_provider_account_tenant_key"
  ON "Account" ("workspaceId", "provider", "providerAccountId")
  WHERE "workspaceId" IS NOT NULL;

CREATE UNIQUE INDEX "Account_provider_account_null_workspace_key"
  ON "Account" ("provider", "providerAccountId")
  WHERE "workspaceId" IS NULL;

CREATE INDEX IF NOT EXISTS "Account_provider_providerAccountId_idx"
  ON "Account" ("provider", "providerAccountId");

CREATE INDEX IF NOT EXISTS "Account_workspaceId_provider_providerAccountId_idx"
  ON "Account" ("workspaceId", "provider", "providerAccountId");
