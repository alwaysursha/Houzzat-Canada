-- Phase 1 — additive workspace identity columns (strict tenant isolation prep).
-- Nullable only. No backfill. No uniqueness change. No row updates/deletes.
-- Safe for currently deployed app (columns unused; User.email @unique retained).

-- AlterTable
ALTER TABLE "User" ADD COLUMN "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "Account" ADD COLUMN "workspaceId" TEXT;

-- CreateIndex
CREATE INDEX "User_workspaceId_idx" ON "User"("workspaceId");

-- CreateIndex
CREATE INDEX "User_workspaceId_email_idx" ON "User"("workspaceId", "email");

-- CreateIndex
CREATE INDEX "Account_workspaceId_idx" ON "Account"("workspaceId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
