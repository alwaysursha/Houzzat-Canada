-- Stage 6.11E.3A / 6.11E.3A.2 — TEAM profile + public roster foundation (additive only).
-- Public roster is independent of User / WorkspaceMember / SaaS seats.
-- Leader: composite FK (workspaceId, leaderMemberId) → Member(workspaceId, id)
--   ON DELETE RESTRICT — app clear-then-delete / clear-then-hide.
-- No destructive changes. No data backfill. No composite SET NULL.

-- Create members first so the composite leader FK can reference them.
CREATE TABLE "WorkspaceTeamMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT,
    "designation" TEXT,
    "photoUrl" TEXT,
    "cellPhone" TEXT,
    "email" TEXT,
    "bio" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceTeamMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceTeamProfile" (
    "workspaceId" TEXT NOT NULL,
    "aboutText" TEXT,
    "serviceAreas" JSONB,
    "leaderMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceTeamProfile_pkey" PRIMARY KEY ("workspaceId")
);

-- Referenced-key unique for composite same-workspace leader FK.
CREATE UNIQUE INDEX "WorkspaceTeamMember_workspaceId_id_key" ON "WorkspaceTeamMember"("workspaceId", "id");

CREATE UNIQUE INDEX "WorkspaceTeamProfile_leaderMemberId_key" ON "WorkspaceTeamProfile"("leaderMemberId");

-- Prisma 1:1 defining-side unique for composite leader relation fields.
CREATE UNIQUE INDEX "WorkspaceTeamProfile_workspaceId_leaderMemberId_key" ON "WorkspaceTeamProfile"("workspaceId", "leaderMemberId");

CREATE INDEX "WorkspaceTeamMember_workspaceId_sortOrder_idx" ON "WorkspaceTeamMember"("workspaceId", "sortOrder");

CREATE INDEX "WorkspaceTeamMember_workspaceId_isVisible_idx" ON "WorkspaceTeamMember"("workspaceId", "isVisible");

ALTER TABLE "WorkspaceTeamMember"
  ADD CONSTRAINT "WorkspaceTeamMember_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceTeamProfile"
  ADD CONSTRAINT "WorkspaceTeamProfile_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Same-workspace leader enforcement (MATCH SIMPLE: NULL leaderMemberId skips check).
ALTER TABLE "WorkspaceTeamProfile"
  ADD CONSTRAINT "WorkspaceTeamProfile_workspaceId_leaderMemberId_fkey"
  FOREIGN KEY ("workspaceId", "leaderMemberId")
  REFERENCES "WorkspaceTeamMember"("workspaceId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
