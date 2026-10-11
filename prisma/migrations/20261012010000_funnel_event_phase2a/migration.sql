-- Phase 2A — tenant-scoped FunnelEvent foundation (additive).
-- Do not fabricate historical funnel rows. Not applied to production by agents.

-- CreateEnum
CREATE TYPE "FunnelEventName" AS ENUM (
  'visitor_session_started',
  'search_results_viewed',
  'property_card_clicked',
  'listing_detail_opened',
  'registration_gate_shown',
  'registration_started',
  'registration_completed',
  'post_registration_continued',
  'registration_engaged'
);

-- CreateTable
CREATE TABLE "FunnelEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventName" "FunnelEventName" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "visitorKey" TEXT,
    "sessionKey" TEXT,
    "userId" TEXT,
    "mlsNumber" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FunnelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FunnelEvent_workspaceId_dedupeKey_key" ON "FunnelEvent"("workspaceId", "dedupeKey");

-- CreateIndex
CREATE INDEX "FunnelEvent_workspaceId_eventName_occurredAt_idx" ON "FunnelEvent"("workspaceId", "eventName", "occurredAt");

-- CreateIndex
CREATE INDEX "FunnelEvent_workspaceId_visitorKey_occurredAt_idx" ON "FunnelEvent"("workspaceId", "visitorKey", "occurredAt");

-- CreateIndex
CREATE INDEX "FunnelEvent_workspaceId_sessionKey_occurredAt_idx" ON "FunnelEvent"("workspaceId", "sessionKey", "occurredAt");

-- CreateIndex
CREATE INDEX "FunnelEvent_workspaceId_userId_occurredAt_idx" ON "FunnelEvent"("workspaceId", "userId", "occurredAt");

-- CreateIndex
CREATE INDEX "FunnelEvent_workspaceId_occurredAt_idx" ON "FunnelEvent"("workspaceId", "occurredAt");

-- AddForeignKey
ALTER TABLE "FunnelEvent" ADD CONSTRAINT "FunnelEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunnelEvent" ADD CONSTRAINT "FunnelEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
