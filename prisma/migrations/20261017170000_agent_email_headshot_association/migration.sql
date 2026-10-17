-- Phase 3D.4.1 — workspace-scoped agent email headshot association.
-- Additive only. Does not alter User.image or WorkspaceBranding.
-- Not applied to production by this change set.

CREATE TABLE "AgentEmailHeadshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceUniqueId" TEXT NOT NULL,
    "emailHeadshotObjectKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentEmailHeadshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentEmailHeadshot_workspaceId_userId_key" ON "AgentEmailHeadshot"("workspaceId", "userId");

CREATE INDEX "AgentEmailHeadshot_userId_idx" ON "AgentEmailHeadshot"("userId");

CREATE INDEX "AgentEmailHeadshot_workspaceId_idx" ON "AgentEmailHeadshot"("workspaceId");

ALTER TABLE "AgentEmailHeadshot" ADD CONSTRAINT "AgentEmailHeadshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentEmailHeadshot" ADD CONSTRAINT "AgentEmailHeadshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
