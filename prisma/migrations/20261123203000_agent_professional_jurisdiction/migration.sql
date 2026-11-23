-- Per-agent licensing jurisdiction. Null on existing rows; never backfilled to Ontario.
ALTER TABLE "AgentProfile" ADD COLUMN "registrationJurisdiction" TEXT;
ALTER TABLE "AgentProfile" ADD COLUMN "registrationNumber" TEXT;

-- Invite snapshot so accept can restore the same fields without a second profile.
ALTER TABLE "WorkspaceInvite" ADD COLUMN "designation" TEXT;
ALTER TABLE "WorkspaceInvite" ADD COLUMN "registrationJurisdiction" TEXT;
ALTER TABLE "WorkspaceInvite" ADD COLUMN "registrationNumber" TEXT;
