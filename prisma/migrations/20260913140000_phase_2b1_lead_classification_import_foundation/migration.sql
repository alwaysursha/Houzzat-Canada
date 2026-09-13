-- Phase 2B-1 — Lead CRM classification + import/tag origin foundation (additive only).
-- NOT APPLIED. Do not run prisma migrate deploy until approved.
-- Lead.isBuyer / Lead.isSeller are nullable NULL on existing rows — no silent classification.
-- Buyer/Seller/Both are NOT seeded as WorkspaceTag rows.
-- No production backfill in this migration. Commented SQL below is for a later step.

-- CreateEnum
CREATE TYPE "WorkspaceTagOrigin" AS ENUM ('MANUAL', 'IMPORTED');

-- CreateEnum
CREATE TYPE "LeadImportJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeadImportRowStatus" AS ENUM ('PENDING', 'CREATED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "LeadImportDefaultType" AS ENUM ('BUYER', 'SELLER', 'BOTH', 'DETECT');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "isBuyer" BOOLEAN,
ADD COLUMN     "isSeller" BOOLEAN;

-- CreateTable
CREATE TABLE "WorkspaceTag" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "origin" "WorkspaceTagOrigin" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadTag" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadOrigin" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "sourceCrm" TEXT,
    "externalContactId" TEXT,
    "originalClassification" TEXT,
    "sourceCreatedAt" TIMESTAMP(3),
    "sourceClosedAt" TIMESTAMP(3),
    "unmappedFields" JSONB,
    "importRowId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadOrigin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadImportJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "importedByUserId" TEXT NOT NULL,
    "filename" TEXT,
    "sourceCrm" TEXT,
    "mapping" JSONB NOT NULL,
    "defaultLeadType" "LeadImportDefaultType" NOT NULL,
    "consentAsserted" BOOLEAN NOT NULL DEFAULT false,
    "checksum" TEXT,
    "allowDuplicates" BOOLEAN NOT NULL DEFAULT false,
    "policies" JSONB,
    "status" "LeadImportJobStatus" NOT NULL DEFAULT 'PENDING',
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "deferredFieldCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadImportRow" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "payloadOriginal" JSONB NOT NULL,
    "payloadCanonical" JSONB NOT NULL,
    "status" "LeadImportRowStatus" NOT NULL DEFAULT 'PENDING',
    "leadId" TEXT,
    "error" TEXT,
    "idempotencyKey" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkspaceTag_workspaceId_idx" ON "WorkspaceTag"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceTag_workspaceId_id_key" ON "WorkspaceTag"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceTag_workspaceId_nameNormalized_key" ON "WorkspaceTag"("workspaceId", "nameNormalized");

-- CreateIndex
CREATE INDEX "LeadTag_workspaceId_tagId_idx" ON "LeadTag"("workspaceId", "tagId");

-- CreateIndex
CREATE INDEX "LeadTag_leadId_idx" ON "LeadTag"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadTag_workspaceId_leadId_tagId_key" ON "LeadTag"("workspaceId", "leadId", "tagId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadOrigin_leadId_key" ON "LeadOrigin"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadOrigin_importRowId_key" ON "LeadOrigin"("importRowId");

-- CreateIndex
CREATE INDEX "LeadOrigin_workspaceId_sourceCrm_idx" ON "LeadOrigin"("workspaceId", "sourceCrm");

-- CreateIndex
CREATE INDEX "LeadOrigin_workspaceId_sourceCrm_externalContactId_idx" ON "LeadOrigin"("workspaceId", "sourceCrm", "externalContactId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadOrigin_workspaceId_leadId_key" ON "LeadOrigin"("workspaceId", "leadId");

-- CreateIndex
CREATE INDEX "LeadImportJob_workspaceId_createdAt_idx" ON "LeadImportJob"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadImportJob_workspaceId_status_idx" ON "LeadImportJob"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "LeadImportJob_workspaceId_checksum_idx" ON "LeadImportJob"("workspaceId", "checksum");

-- CreateIndex
CREATE UNIQUE INDEX "LeadImportJob_workspaceId_id_key" ON "LeadImportJob"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "LeadImportRow_workspaceId_status_idx" ON "LeadImportRow"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "LeadImportRow_leadId_idx" ON "LeadImportRow"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadImportRow_workspaceId_id_key" ON "LeadImportRow"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "LeadImportRow_jobId_rowNumber_key" ON "LeadImportRow"("jobId", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "LeadImportRow_jobId_idempotencyKey_key" ON "LeadImportRow"("jobId", "idempotencyKey");

-- Referenced-key unique for composite same-workspace FKs. Full scan of Lead.
CREATE UNIQUE INDEX "Lead_workspaceId_id_key" ON "Lead"("workspaceId", "id");

-- AddForeignKey
ALTER TABLE "WorkspaceTag" ADD CONSTRAINT "WorkspaceTag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadTag" ADD CONSTRAINT "LeadTag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadTag" ADD CONSTRAINT "LeadTag_workspaceId_leadId_fkey" FOREIGN KEY ("workspaceId", "leadId") REFERENCES "Lead"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadTag" ADD CONSTRAINT "LeadTag_workspaceId_tagId_fkey" FOREIGN KEY ("workspaceId", "tagId") REFERENCES "WorkspaceTag"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadOrigin" ADD CONSTRAINT "LeadOrigin_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadOrigin" ADD CONSTRAINT "LeadOrigin_workspaceId_leadId_fkey" FOREIGN KEY ("workspaceId", "leadId") REFERENCES "Lead"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadOrigin" ADD CONSTRAINT "LeadOrigin_importRowId_fkey" FOREIGN KEY ("importRowId") REFERENCES "LeadImportRow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadImportJob" ADD CONSTRAINT "LeadImportJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadImportJob" ADD CONSTRAINT "LeadImportJob_importedByUserId_fkey" FOREIGN KEY ("importedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadImportRow" ADD CONSTRAINT "LeadImportRow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadImportRow" ADD CONSTRAINT "LeadImportRow_workspaceId_jobId_fkey" FOREIGN KEY ("workspaceId", "jobId") REFERENCES "LeadImportJob"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadImportRow" ADD CONSTRAINT "LeadImportRow_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tenant-safe optional lead attach (Prisma cannot express mixed-nullability composite FKs).
-- MATCH SIMPLE: NULL leadId skips the check. Cross-workspace leadId is rejected.
ALTER TABLE "LeadImportRow"
  ADD CONSTRAINT "LeadImportRow_workspaceId_leadId_fkey"
  FOREIGN KEY ("workspaceId", "leadId")
  REFERENCES "Lead"("workspaceId", "id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Tenant-safe optional origin → import row (MATCH SIMPLE: NULL importRowId skips).
ALTER TABLE "LeadOrigin"
  ADD CONSTRAINT "LeadOrigin_workspaceId_importRowId_fkey"
  FOREIGN KEY ("workspaceId", "importRowId")
  REFERENCES "LeadImportRow"("workspaceId", "id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================
-- LATER BACKFILL ONLY — DO NOT RUN AS PART OF APPLYING THIS MIGRATION.
-- Existing Lead.isBuyer / isSeller stay NULL until an explicit backfill ships.
--
-- Use ONLY workspace-owned Lead.intent. Do NOT join User.isBuyer / isSeller
-- (those flags may already contain cross-workspace CRM contamination).
-- Do not infer historical BOTH. No LeadIntent.BOTH.
--
-- Conservative rule:
--   intent = BUYER  → isBuyer = true,  isSeller = false
--   intent = SELLER → isSeller = true, isBuyer = NULL
--     NULL isBuyer = "legacy buyer-side classification unknown"
--     (false would invent "not a buyer" and could bake in leakage)
--
-- CRM UI: Buyer chip is truthy-only; NULL hides Buyer the same as false.
-- New imports (later app logic) will write explicit true/false.
--
-- UPDATE "Lead"
-- SET
--   "isBuyer" = CASE WHEN "intent" = 'BUYER' THEN true ELSE NULL END,
--   "isSeller" = ("intent" = 'SELLER')
-- WHERE "isBuyer" IS NULL
--   AND "isSeller" IS NULL;
-- =============================================================================
