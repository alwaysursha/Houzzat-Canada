-- Phase 1 cross-device browse memory (Active Search + Recent Searches).
-- Additive only — does not alter SavedSearch / alerts / Primary ownership.

CREATE TABLE IF NOT EXISTS "CustomerBrowseState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "activeSearchHref" TEXT,
    "activeUpdatedAt" TIMESTAMP(3),
    "recentSearches" JSONB NOT NULL DEFAULT '[]',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerBrowseState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerBrowseState_userId_key"
  ON "CustomerBrowseState"("userId");

CREATE INDEX IF NOT EXISTS "CustomerBrowseState_workspaceId_userId_idx"
  ON "CustomerBrowseState"("workspaceId", "userId");

CREATE INDEX IF NOT EXISTS "CustomerBrowseState_workspaceId_updatedAt_idx"
  ON "CustomerBrowseState"("workspaceId", "updatedAt");

DO $$ BEGIN
  ALTER TABLE "CustomerBrowseState"
    ADD CONSTRAINT "CustomerBrowseState_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CustomerBrowseState"
    ADD CONSTRAINT "CustomerBrowseState_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
