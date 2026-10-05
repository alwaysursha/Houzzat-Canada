-- Phase 2B-1 preference-access tokens (additive).
-- Do not apply to production from this change set.
-- Raw bearer tokens are never stored (no plaintext, no encrypted copy).

-- CreateEnum
CREATE TYPE "CommunicationPreferenceTokenPurpose" AS ENUM ('MANAGE', 'ONE_CLICK');

-- CreateTable
CREATE TABLE "CommunicationPreferenceToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" "CommunicationPreferenceTokenPurpose" NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationPreferenceToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationPreferenceToken_tokenHash_key" ON "CommunicationPreferenceToken"("tokenHash");

-- CreateIndex
CREATE INDEX "CommunicationPreferenceToken_userId_workspaceId_purpose_idx" ON "CommunicationPreferenceToken"("userId", "workspaceId", "purpose");

-- CreateIndex
CREATE INDEX "CommunicationPreferenceToken_workspaceId_idx" ON "CommunicationPreferenceToken"("workspaceId");

-- CreateIndex
CREATE INDEX "CommunicationPreferenceToken_emailNormalized_idx" ON "CommunicationPreferenceToken"("emailNormalized");

-- CreateIndex
CREATE INDEX "CommunicationPreferenceToken_expiresAt_idx" ON "CommunicationPreferenceToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "CommunicationPreferenceToken" ADD CONSTRAINT "CommunicationPreferenceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationPreferenceToken" ADD CONSTRAINT "CommunicationPreferenceToken_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
