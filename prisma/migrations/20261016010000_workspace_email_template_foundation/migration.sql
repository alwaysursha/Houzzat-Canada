-- Phase 2A — tenant email template overrides (draft + published version history).
-- Master defaults remain code-based (src/lib/email/workspace-templates/registry.ts).
-- DO NOT apply to production from this change set without an explicit deploy plan.
-- Live Resend senders are NOT switched to these overrides in Phase 2A.

-- CreateEnum
CREATE TYPE "WorkspaceEmailTemplateType" AS ENUM (
  'PROPERTY_WATCH',
  'AREA_WATCH',
  'SAVED_SEARCH_DIGEST',
  'SELLER_NEIGHBOURHOOD_DIGEST',
  'AGENT_EMAIL',
  'SHORTLIST',
  'CMA_SHARE',
  'NEWSLETTER'
);

-- CreateEnum
CREATE TYPE "WorkspaceEmailTemplateVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "WorkspaceEmailTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "templateType" "WorkspaceEmailTemplateType" NOT NULL,
    "draftSubject" TEXT,
    "draftIntroText" TEXT,
    "draftBodySectionsJson" JSONB,
    "draftCtaText" TEXT,
    "draftStyleJson" JSONB,
    "draftUpdatedAt" TIMESTAMP(3),
    "draftUpdatedByUserId" TEXT,
    "publishedVersionId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceEmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceEmailTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "templateType" "WorkspaceEmailTemplateType" NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "WorkspaceEmailTemplateVersionStatus" NOT NULL DEFAULT 'PUBLISHED',
    "subject" TEXT,
    "introText" TEXT,
    "bodySectionsJson" JSONB,
    "ctaText" TEXT,
    "styleJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedByUserId" TEXT,

    CONSTRAINT "WorkspaceEmailTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceEmailTemplate_publishedVersionId_key" ON "WorkspaceEmailTemplate"("publishedVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceEmailTemplate_workspaceId_templateType_key" ON "WorkspaceEmailTemplate"("workspaceId", "templateType");

-- CreateIndex
CREATE INDEX "WorkspaceEmailTemplate_workspaceId_idx" ON "WorkspaceEmailTemplate"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceEmailTemplate_workspaceId_publishedAt_idx" ON "WorkspaceEmailTemplate"("workspaceId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceEmailTemplateVersion_templateId_versionNumber_key" ON "WorkspaceEmailTemplateVersion"("templateId", "versionNumber");

-- CreateIndex
CREATE INDEX "WorkspaceEmailTemplateVersion_workspaceId_templateType_publishedAt_idx" ON "WorkspaceEmailTemplateVersion"("workspaceId", "templateType", "publishedAt");

-- CreateIndex
CREATE INDEX "WorkspaceEmailTemplateVersion_templateId_status_idx" ON "WorkspaceEmailTemplateVersion"("templateId", "status");

-- AddForeignKey
ALTER TABLE "WorkspaceEmailTemplate" ADD CONSTRAINT "WorkspaceEmailTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceEmailTemplate" ADD CONSTRAINT "WorkspaceEmailTemplate_draftUpdatedByUserId_fkey" FOREIGN KEY ("draftUpdatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceEmailTemplate" ADD CONSTRAINT "WorkspaceEmailTemplate_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceEmailTemplateVersion" ADD CONSTRAINT "WorkspaceEmailTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WorkspaceEmailTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceEmailTemplateVersion" ADD CONSTRAINT "WorkspaceEmailTemplateVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceEmailTemplateVersion" ADD CONSTRAINT "WorkspaceEmailTemplateVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceEmailTemplateVersion" ADD CONSTRAINT "WorkspaceEmailTemplateVersion_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (published pointer — after version table exists)
ALTER TABLE "WorkspaceEmailTemplate" ADD CONSTRAINT "WorkspaceEmailTemplate_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "WorkspaceEmailTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
