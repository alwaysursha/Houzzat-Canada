-- Platform-global SMS automation catalog + immutable versions (additive).
-- NOT APPLIED. Do not run prisma migrate deploy until you apply it separately.
-- No trigger wiring, Twilio sends, or per-tenant template overrides.

-- CreateEnum
CREATE TYPE "SmsAutomationRecipient" AS ENUM ('LEAD', 'AGENT');

-- CreateEnum
CREATE TYPE "SmsAutomationVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "SmsAutomationDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "recipient" "SmsAutomationRecipient" NOT NULL,
    "triggerKey" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "replyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "delayMinutes" INTEGER,
    "inactivityDays" INTEGER,
    "inactivityBucketsJson" JSONB,
    "allowedVariables" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsAutomationDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsAutomationVersion" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "SmsAutomationVersionStatus" NOT NULL,
    "body" TEXT NOT NULL,
    "delayMinutes" INTEGER,
    "inactivityDays" INTEGER,
    "inactivityBucketsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByOperatorId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedByOperatorId" TEXT,
    "rollbackOfVersionId" TEXT,

    CONSTRAINT "SmsAutomationVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SmsAutomationDefinition_key_key" ON "SmsAutomationDefinition"("key");

-- CreateIndex
CREATE INDEX "SmsAutomationDefinition_recipient_triggerKey_idx" ON "SmsAutomationDefinition"("recipient", "triggerKey");

-- CreateIndex
CREATE INDEX "SmsAutomationDefinition_active_idx" ON "SmsAutomationDefinition"("active");

-- CreateIndex
CREATE UNIQUE INDEX "SmsAutomationVersion_definitionId_versionNumber_key" ON "SmsAutomationVersion"("definitionId", "versionNumber");

-- CreateIndex
CREATE INDEX "SmsAutomationVersion_definitionId_status_idx" ON "SmsAutomationVersion"("definitionId", "status");

-- CreateIndex
CREATE INDEX "SmsAutomationVersion_definitionId_publishedAt_idx" ON "SmsAutomationVersion"("definitionId", "publishedAt");

-- AddForeignKey
ALTER TABLE "SmsAutomationVersion" ADD CONSTRAINT "SmsAutomationVersion_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "SmsAutomationDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsAutomationVersion" ADD CONSTRAINT "SmsAutomationVersion_createdByOperatorId_fkey" FOREIGN KEY ("createdByOperatorId") REFERENCES "PlatformOperator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsAutomationVersion" ADD CONSTRAINT "SmsAutomationVersion_publishedByOperatorId_fkey" FOREIGN KEY ("publishedByOperatorId") REFERENCES "PlatformOperator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
