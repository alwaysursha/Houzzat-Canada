-- Stage 3K.4.2 — additive platform vs custom domain kind (NOT applied by Cursor)
-- CreateEnum
CREATE TYPE "WorkspaceDomainKind" AS ENUM ('PLATFORM', 'CUSTOM');

-- AlterTable: existing rows are custom domains (houzzat.com, canary.houzzat.com, etc.)
ALTER TABLE "WorkspaceDomain" ADD COLUMN "kind" "WorkspaceDomainKind" NOT NULL DEFAULT 'CUSTOM';

-- Replace partial unique index: one PRIMARY per workspace → kind-aware constraints
DROP INDEX IF EXISTS "WorkspaceDomain_one_primary_per_workspace";

-- At most one PLATFORM hostname per workspace
CREATE UNIQUE INDEX "WorkspaceDomain_one_platform_per_workspace"
    ON "WorkspaceDomain"("workspaceId")
    WHERE "kind" = 'PLATFORM';

-- At most one CUSTOM PRIMARY (preferred custom domain) per workspace
CREATE UNIQUE INDEX "WorkspaceDomain_one_custom_primary_per_workspace"
    ON "WorkspaceDomain"("workspaceId")
    WHERE "kind" = 'CUSTOM' AND "role" = 'PRIMARY';
