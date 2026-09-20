-- Platform-global Quick Texts + per-workspace SMS segment usage (additive).
-- NOT APPLIED. Do not run prisma migrate deploy until you apply it separately.
-- No Mass SMS loops, automation trigger wiring, or Stripe SMS credits.

-- CreateEnum
CREATE TYPE "SmsUsageCategory" AS ENUM ('AUTOMATION', 'AGENT_INDIVIDUAL', 'AGENT_MASS', 'AGENT_NOTIFICATION');

-- CreateEnum
CREATE TYPE "SmsUsageRecipientType" AS ENUM ('LEAD', 'AGENT');

-- CreateEnum
CREATE TYPE "SmsSegmentCountSource" AS ENUM ('ESTIMATED', 'PROVIDER');

-- CreateTable
CREATE TABLE "SmsQuickText" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "allowedVariables" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByOperatorId" TEXT,
    "updatedByOperatorId" TEXT,

    CONSTRAINT "SmsQuickText_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsUsageEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "category" "SmsUsageCategory" NOT NULL,
    "recipientType" "SmsUsageRecipientType" NOT NULL,
    "twilioMessageSid" TEXT,
    "messageId" TEXT,
    "segmentCount" INTEGER NOT NULL,
    "segmentCountSource" "SmsSegmentCountSource" NOT NULL,
    "finalized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SmsQuickText_key_key" ON "SmsQuickText"("key");

-- CreateIndex
CREATE INDEX "SmsQuickText_active_sortOrder_idx" ON "SmsQuickText"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "SmsQuickText_category_sortOrder_idx" ON "SmsQuickText"("category", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SmsUsageEvent_twilioMessageSid_key" ON "SmsUsageEvent"("twilioMessageSid");

-- CreateIndex
CREATE INDEX "SmsUsageEvent_workspaceId_periodStart_periodEnd_idx" ON "SmsUsageEvent"("workspaceId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "SmsUsageEvent_workspaceId_category_idx" ON "SmsUsageEvent"("workspaceId", "category");

-- CreateIndex
CREATE INDEX "SmsUsageEvent_messageId_idx" ON "SmsUsageEvent"("messageId");

-- AddForeignKey
ALTER TABLE "SmsQuickText" ADD CONSTRAINT "SmsQuickText_createdByOperatorId_fkey" FOREIGN KEY ("createdByOperatorId") REFERENCES "PlatformOperator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsQuickText" ADD CONSTRAINT "SmsQuickText_updatedByOperatorId_fkey" FOREIGN KEY ("updatedByOperatorId") REFERENCES "PlatformOperator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsUsageEvent" ADD CONSTRAINT "SmsUsageEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
