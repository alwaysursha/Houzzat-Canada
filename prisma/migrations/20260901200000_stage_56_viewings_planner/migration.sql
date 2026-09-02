-- Stage 5.6 — HouzzatPRO Viewings Planner persistence on ViewingTour / ViewingTourStop

-- ViewingTour.userId optional (PRO tours may have no customer account)
ALTER TABLE "ViewingTour" ALTER COLUMN "userId" DROP NOT NULL;

-- HouzzatPRO lead/workspace/agent scope
ALTER TABLE "ViewingTour" ADD COLUMN "leadId" TEXT;
ALTER TABLE "ViewingTour" ADD COLUMN "agentId" TEXT;
ALTER TABLE "ViewingTour" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "ViewingTour" ADD COLUMN "viewingDate" TIMESTAMP(3);

-- Stop ↔ canonical Appointment sync
ALTER TABLE "ViewingTourStop" ADD COLUMN "appointmentId" TEXT;

CREATE UNIQUE INDEX "ViewingTourStop_appointmentId_key" ON "ViewingTourStop"("appointmentId");

CREATE INDEX "ViewingTour_leadId_isActive_idx" ON "ViewingTour"("leadId", "isActive");
CREATE INDEX "ViewingTour_workspaceId_agentId_status_idx" ON "ViewingTour"("workspaceId", "agentId", "status");

ALTER TABLE "ViewingTour" ADD CONSTRAINT "ViewingTour_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ViewingTour" ADD CONSTRAINT "ViewingTour_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ViewingTour" ADD CONSTRAINT "ViewingTour_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ViewingTourStop" ADD CONSTRAINT "ViewingTourStop_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
