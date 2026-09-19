-- Phase 1 SMS foundation (additive).
-- NOT APPLIED. Do not run prisma migrate deploy until you apply it separately.
-- No inbound webhook, status callback route, Agent SMS composer, or Twilio config.

-- AlterTable User
ALTER TABLE "User" ADD COLUMN "phoneE164" TEXT;

-- AlterTable Workspace
ALTER TABLE "Workspace" ADD COLUMN "twilioPhoneE164" TEXT;

-- CreateIndex
CREATE INDEX "User_phoneE164_idx" ON "User"("phoneE164");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_twilioPhoneE164_key" ON "Workspace"("twilioPhoneE164");

-- CreateTable
CREATE TABLE "SmsSuppression" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "suppressedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "keyword" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundSmsQuarantine" (
    "id" TEXT NOT NULL,
    "twilioMessageSid" TEXT NOT NULL,
    "fromE164" TEXT NOT NULL,
    "toE164" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "workspaceId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundSmsQuarantine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SmsSuppression_workspaceId_phoneE164_key" ON "SmsSuppression"("workspaceId", "phoneE164");

-- CreateIndex
CREATE INDEX "SmsSuppression_phoneE164_idx" ON "SmsSuppression"("phoneE164");

-- CreateIndex
CREATE UNIQUE INDEX "InboundSmsQuarantine_twilioMessageSid_key" ON "InboundSmsQuarantine"("twilioMessageSid");

-- CreateIndex
CREATE INDEX "InboundSmsQuarantine_workspaceId_receivedAt_idx" ON "InboundSmsQuarantine"("workspaceId", "receivedAt");

-- CreateIndex
CREATE INDEX "InboundSmsQuarantine_fromE164_idx" ON "InboundSmsQuarantine"("fromE164");

-- AddForeignKey
ALTER TABLE "SmsSuppression" ADD CONSTRAINT "SmsSuppression_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundSmsQuarantine" ADD CONSTRAINT "InboundSmsQuarantine_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Safe backfill: only numbers that already look like E.164, or unambiguous NANP.
UPDATE "User"
SET "phoneE164" = "phone"
WHERE "phoneE164" IS NULL
  AND "phone" ~ '^\+[1-9][0-9]{7,14}$';

UPDATE "User"
SET "phoneE164" = '+' || regexp_replace("phone", '[^0-9]', '', 'g')
WHERE "phoneE164" IS NULL
  AND regexp_replace("phone", '[^0-9]', '', 'g') ~ '^1[2-9][0-9]{9}$';

UPDATE "User"
SET "phoneE164" = '+1' || regexp_replace("phone", '[^0-9]', '', 'g')
WHERE "phoneE164" IS NULL
  AND regexp_replace("phone", '[^0-9]', '', 'g') ~ '^[2-9][0-9]{9}$';
