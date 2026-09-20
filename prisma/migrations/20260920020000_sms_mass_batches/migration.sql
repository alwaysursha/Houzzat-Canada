-- Agent Mass SMS batches + per-recipient idempotency (additive).
-- NOT APPLIED. Do not run prisma migrate deploy until you apply it separately.
-- No automation trigger wiring, Stripe SMS credits, or new job infrastructure.

-- CreateEnum
CREATE TYPE "SmsMassBatchStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "SmsMassRecipientStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'EXCLUDED');

-- CreateTable
CREATE TABLE "SmsMassBatch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentUserId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "SmsMassBatchStatus" NOT NULL DEFAULT 'PENDING',
    "requestedCount" INTEGER NOT NULL DEFAULT 0,
    "eligibleCount" INTEGER NOT NULL DEFAULT 0,
    "excludedCount" INTEGER NOT NULL DEFAULT 0,
    "successfulCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedSegments" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsMassBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsMassBatchRecipient" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" "SmsMassRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "excludeReason" TEXT,
    "twilioMessageSid" TEXT,
    "messageId" TEXT,
    "segmentCount" INTEGER,
    "errorCode" TEXT,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "SmsMassBatchRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SmsMassBatch_workspaceId_agentUserId_clientKey_key" ON "SmsMassBatch"("workspaceId", "agentUserId", "clientKey");

-- CreateIndex
CREATE INDEX "SmsMassBatch_workspaceId_createdAt_idx" ON "SmsMassBatch"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "SmsMassBatch_agentUserId_createdAt_idx" ON "SmsMassBatch"("agentUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SmsMassBatchRecipient_batchId_leadId_key" ON "SmsMassBatchRecipient"("batchId", "leadId");

-- CreateIndex
CREATE INDEX "SmsMassBatchRecipient_batchId_status_idx" ON "SmsMassBatchRecipient"("batchId", "status");

-- CreateIndex
CREATE INDEX "SmsMassBatchRecipient_leadId_idx" ON "SmsMassBatchRecipient"("leadId");

-- AddForeignKey
ALTER TABLE "SmsMassBatch" ADD CONSTRAINT "SmsMassBatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMassBatchRecipient" ADD CONSTRAINT "SmsMassBatchRecipient_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "SmsMassBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
