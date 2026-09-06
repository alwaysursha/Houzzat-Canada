-- Stage 6.11D — Professional + brokerage identity foundation (additive only).
-- Canonical tenant identity; image assets remain on WorkspaceBranding.
-- Stage 6.11D.2 — brokerageFax is the fax field (registration number is not collected).
-- No destructive changes. No data backfill from displayName/contactPhone.

CREATE TABLE "WorkspaceProfessionalIdentity" (
    "workspaceId" TEXT NOT NULL,
    "agentRegisteredName" TEXT,
    "agentDesignation" TEXT,
    "agentCellPhone" TEXT,
    "brokerageRegisteredName" TEXT,
    "brokeragePhone" TEXT,
    "brokerageFax" TEXT,
    "brokerageAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceProfessionalIdentity_pkey" PRIMARY KEY ("workspaceId")
);

ALTER TABLE "WorkspaceProfessionalIdentity"
  ADD CONSTRAINT "WorkspaceProfessionalIdentity_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceOnboardingState"
  ADD COLUMN "professionalIdentityStatus" "WorkspaceOnboardingStepStatus"
  NOT NULL DEFAULT 'NOT_STARTED';
