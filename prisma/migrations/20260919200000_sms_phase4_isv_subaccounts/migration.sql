-- Twilio ISV Phase 4 — subaccount-per-workspace (additive).
-- NOT APPLIED. Do not run prisma migrate deploy until you apply it separately.
-- No Twilio resource provisioning, number purchase/transfer, or production config.
-- Auth tokens / API key secrets are not stored in Postgres.

-- AlterTable Workspace
ALTER TABLE "Workspace" ADD COLUMN "twilioSubaccountSid" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "twilioMessagingServiceSid" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "twilioPhoneSid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_twilioSubaccountSid_key" ON "Workspace"("twilioSubaccountSid");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_twilioMessagingServiceSid_key" ON "Workspace"("twilioMessagingServiceSid");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_twilioPhoneSid_key" ON "Workspace"("twilioPhoneSid");
