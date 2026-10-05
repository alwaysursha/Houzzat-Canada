-- Phase 1 communication preference / email suppression foundation (additive).
-- DO NOT apply to production from this change set.

-- CreateEnum
CREATE TYPE "EmailSuppressionScope" AS ENUM ('MAILBOX', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "EmailSuppressionReason" AS ENUM ('HARD_BOUNCE', 'COMPLAINT', 'GLOBAL_UNSUBSCRIBE', 'ADMIN');

-- CreateEnum
CREATE TYPE "CommunicationChannel" AS ENUM ('EMAIL', 'PUSH');

-- CreateEnum
CREATE TYPE "CommunicationCategory" AS ENUM (
  'PROPERTY_WATCH',
  'AREA_WATCH',
  'SAVED_SEARCH',
  'BUYER_DIGEST',
  'SELLER_REPORT',
  'AGENT_COMMUNICATION',
  'MARKETING',
  'ACCOUNT_SECURITY',
  'CONTACT_UPDATE',
  'VIEWING'
);

-- CreateTable
CREATE TABLE "EmailSuppression" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "emailNormalized" TEXT NOT NULL,
    "scope" "EmailSuppressionScope" NOT NULL,
    "identityKey" TEXT NOT NULL,
    "reason" "EmailSuppressionReason" NOT NULL,
    "source" TEXT NOT NULL,
    "providerId" TEXT,
    "leadEmailLogId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "category" "CommunicationCategory" NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationPreferenceEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "userId" TEXT,
    "leadId" TEXT,
    "emailNormalized" TEXT,
    "kind" TEXT NOT NULL,
    "category" TEXT,
    "channel" TEXT,
    "previousState" JSONB,
    "resultingState" JSONB,
    "source" TEXT NOT NULL,
    "providerEventId" TEXT,
    "providerId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationPreferenceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- MAILBOX identityKey = emailNormalized; CUSTOMER identityKey = userId.
CREATE UNIQUE INDEX "EmailSuppression_workspaceId_scope_identityKey_key" ON "EmailSuppression"("workspaceId", "scope", "identityKey");

-- CreateIndex
CREATE INDEX "EmailSuppression_workspaceId_emailNormalized_idx" ON "EmailSuppression"("workspaceId", "emailNormalized");

-- CreateIndex
CREATE INDEX "EmailSuppression_emailNormalized_idx" ON "EmailSuppression"("emailNormalized");

-- CreateIndex
CREATE INDEX "EmailSuppression_userId_idx" ON "EmailSuppression"("userId");

-- CreateIndex
CREATE INDEX "EmailSuppression_providerId_idx" ON "EmailSuppression"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationPreference_userId_category_channel_key" ON "CommunicationPreference"("userId", "category", "channel");

-- CreateIndex
CREATE INDEX "CommunicationPreference_workspaceId_category_channel_idx" ON "CommunicationPreference"("workspaceId", "category", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationPreferenceEvent_providerEventId_key" ON "CommunicationPreferenceEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "CommunicationPreferenceEvent_workspaceId_createdAt_idx" ON "CommunicationPreferenceEvent"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunicationPreferenceEvent_userId_createdAt_idx" ON "CommunicationPreferenceEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunicationPreferenceEvent_emailNormalized_createdAt_idx" ON "CommunicationPreferenceEvent"("emailNormalized", "createdAt");

-- CreateIndex
CREATE INDEX "CommunicationPreferenceEvent_kind_createdAt_idx" ON "CommunicationPreferenceEvent"("kind", "createdAt");

-- AddForeignKey
ALTER TABLE "EmailSuppression" ADD CONSTRAINT "EmailSuppression_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSuppression" ADD CONSTRAINT "EmailSuppression_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationPreference" ADD CONSTRAINT "CommunicationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationPreference" ADD CONSTRAINT "CommunicationPreference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationPreferenceEvent" ADD CONSTRAINT "CommunicationPreferenceEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationPreferenceEvent" ADD CONSTRAINT "CommunicationPreferenceEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
