-- SMS automation dispatch idempotency (additive).
-- NOT APPLIED. Do not run prisma migrate deploy until you apply it separately.
-- No Stripe SMS credits. No MLS sync. No new job product.

-- CreateEnum
CREATE TYPE "SmsAutomationDispatchStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "SmsAutomationDispatch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "automationKey" TEXT NOT NULL,
    "cycleKey" TEXT NOT NULL,
    "status" "SmsAutomationDispatchStatus" NOT NULL DEFAULT 'PENDING',
    "twilioMessageSid" TEXT,
    "messageId" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "SmsAutomationDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SmsAutomationDispatch_workspaceId_leadId_automationKey_cycleKey_key" ON "SmsAutomationDispatch"("workspaceId", "leadId", "automationKey", "cycleKey");

-- CreateIndex
CREATE INDEX "SmsAutomationDispatch_workspaceId_createdAt_idx" ON "SmsAutomationDispatch"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "SmsAutomationDispatch_leadId_automationKey_idx" ON "SmsAutomationDispatch"("leadId", "automationKey");

-- CreateIndex
CREATE INDEX "SmsAutomationDispatch_status_createdAt_idx" ON "SmsAutomationDispatch"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "SmsAutomationDispatch" ADD CONSTRAINT "SmsAutomationDispatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
