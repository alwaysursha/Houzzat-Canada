-- Stage 6.10A — Owner activation + onboarding foundation (additive only)
-- No destructive changes. Safe for existing Houzzat / Tenant Canary / workspaces.

CREATE TYPE "WorkspaceOwnerActivationStatus" AS ENUM ('PENDING', 'SENT', 'USED', 'REVOKED', 'EXPIRED');
CREATE TYPE "WorkspaceOnboardingStepStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'SKIPPED');

CREATE TABLE "WorkspaceOwnerActivation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "WorkspaceOwnerActivationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdByType" "PlatformAuditActorType" NOT NULL DEFAULT 'OPERATOR',
    "createdByOperatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceOwnerActivation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceOwnerActivation_tokenHash_key" ON "WorkspaceOwnerActivation"("tokenHash");
CREATE INDEX "WorkspaceOwnerActivation_workspaceId_userId_status_idx" ON "WorkspaceOwnerActivation"("workspaceId", "userId", "status");
CREATE INDEX "WorkspaceOwnerActivation_userId_status_idx" ON "WorkspaceOwnerActivation"("userId", "status");
CREATE INDEX "WorkspaceOwnerActivation_expiresAt_idx" ON "WorkspaceOwnerActivation"("expiresAt");

ALTER TABLE "WorkspaceOwnerActivation"
  ADD CONSTRAINT "WorkspaceOwnerActivation_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceOwnerActivation"
  ADD CONSTRAINT "WorkspaceOwnerActivation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceOwnerActivation"
  ADD CONSTRAINT "WorkspaceOwnerActivation_createdByOperatorId_fkey"
  FOREIGN KEY ("createdByOperatorId") REFERENCES "PlatformOperator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "WorkspaceOnboardingState" (
    "workspaceId" TEXT NOT NULL,
    "accountActivatedAt" TIMESTAMP(3),
    "businessProfileStatus" "WorkspaceOnboardingStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "brandingStatus" "WorkspaceOnboardingStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "templateThemeStatus" "WorkspaceOnboardingStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "emailIdentityStatus" "WorkspaceOnboardingStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceOnboardingState_pkey" PRIMARY KEY ("workspaceId")
);

ALTER TABLE "WorkspaceOnboardingState"
  ADD CONSTRAINT "WorkspaceOnboardingState_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
