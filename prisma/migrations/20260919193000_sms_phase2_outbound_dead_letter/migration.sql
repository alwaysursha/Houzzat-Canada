-- Phase 2 SMS outbound dead-letter (additive).
-- NOT APPLIED. Do not run prisma migrate deploy until you apply it separately.
-- No inbound webhook, STOP/START/HELP, production Twilio, or number attachment.

-- CreateTable
CREATE TABLE "OutboundSmsDeadLetter" (
    "id" TEXT NOT NULL,
    "twilioMessageSid" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "conversationId" TEXT,
    "fromE164" TEXT NOT NULL,
    "toE164" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundSmsDeadLetter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutboundSmsDeadLetter_twilioMessageSid_key" ON "OutboundSmsDeadLetter"("twilioMessageSid");

-- CreateIndex
CREATE INDEX "OutboundSmsDeadLetter_workspaceId_createdAt_idx" ON "OutboundSmsDeadLetter"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundSmsDeadLetter_leadId_idx" ON "OutboundSmsDeadLetter"("leadId");

-- AddForeignKey
ALTER TABLE "OutboundSmsDeadLetter" ADD CONSTRAINT "OutboundSmsDeadLetter_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
