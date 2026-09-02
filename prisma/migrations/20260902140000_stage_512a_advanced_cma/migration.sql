-- Stage 5.12A — Advanced CMA persistence on CmaReport (additive, legacy-safe)

ALTER TABLE "CmaReport" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "CmaReport" ADD COLUMN "leadId" TEXT;
ALTER TABLE "CmaReport" ADD COLUMN "subjectMls" TEXT;
ALTER TABLE "CmaReport" ADD COLUMN "subjectSnapshot" JSONB;
ALTER TABLE "CmaReport" ADD COLUMN "selectedComps" JSONB;
ALTER TABLE "CmaReport" ADD COLUMN "analysis" JSONB;
ALTER TABLE "CmaReport" ADD COLUMN "recommendedListPrice" INTEGER;
ALTER TABLE "CmaReport" ADD COLUMN "recommendationNote" TEXT;
ALTER TABLE "CmaReport" ADD COLUMN "narrative" TEXT;
ALTER TABLE "CmaReport" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CmaReport" ADD COLUMN "revokedAt" TIMESTAMP(3);

CREATE INDEX "CmaReport_workspaceId_updatedAt_idx" ON "CmaReport"("workspaceId", "updatedAt");
CREATE INDEX "CmaReport_workspaceId_agentId_idx" ON "CmaReport"("workspaceId", "agentId");
CREATE INDEX "CmaReport_leadId_idx" ON "CmaReport"("leadId");

ALTER TABLE "CmaReport" ADD CONSTRAINT "CmaReport_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CmaReport" ADD CONSTRAINT "CmaReport_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
