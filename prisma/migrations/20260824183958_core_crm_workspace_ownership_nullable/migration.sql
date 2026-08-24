-- AlterTable
ALTER TABLE "AgentTask" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "LeadEmailLog" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "LeadNote" ADD COLUMN     "workspaceId" TEXT;

-- CreateIndex
CREATE INDEX "AgentTask_workspaceId_status_dueAt_idx" ON "AgentTask"("workspaceId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Lead_workspaceId_status_idx" ON "Lead"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Lead_workspaceId_assignedAgentId_idx" ON "Lead"("workspaceId", "assignedAgentId");

-- CreateIndex
CREATE INDEX "LeadEmailLog_workspaceId_createdAt_idx" ON "LeadEmailLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadNote_workspaceId_createdAt_idx" ON "LeadNote"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEmailLog" ADD CONSTRAINT "LeadEmailLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
