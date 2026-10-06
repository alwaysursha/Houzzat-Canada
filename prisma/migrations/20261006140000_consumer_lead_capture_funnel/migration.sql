-- Consumer lead capture + qualification funnel (additive, backward-compatible).

-- CreateEnum
CREATE TYPE "PasswordCredentialKind" AS ENUM ('LEGACY', 'PHONE_E164');

-- CreateEnum
CREATE TYPE "MortgageFinancing" AS ENUM ('PRE_APPROVED', 'NOT_PRE_APPROVED', 'CASH');

-- AlterEnum PurchaseTimeframe — add THREE_TO_SIX_MONTHS
ALTER TYPE "PurchaseTimeframe" ADD VALUE IF NOT EXISTS 'THREE_TO_SIX_MONTHS';

-- AlterTable User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordCredentialKind" "PasswordCredentialKind" NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "ownsHome" BOOLEAN;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mortgageFinancing" "MortgageFinancing";
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "qualificationCompletedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneOtpVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "homeUnit" TEXT;

-- AlterTable Lead
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "captureContext" JSONB;

-- CreateTable BuyerConfirmedPreference
CREATE TABLE IF NOT EXISTS "BuyerConfirmedPreference" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "communities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "propertyTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minPrice" INTEGER,
    "maxPrice" INTEGER,
    "minBeds" INTEGER,
    "transactionType" TEXT,
    "source" TEXT NOT NULL DEFAULT 'confirmed',
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerConfirmedPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BuyerConfirmedPreference_userId_key" ON "BuyerConfirmedPreference"("userId");
CREATE INDEX IF NOT EXISTS "BuyerConfirmedPreference_workspaceId_confirmedAt_idx" ON "BuyerConfirmedPreference"("workspaceId", "confirmedAt");

-- CreateTable PhoneOtpChallenge
CREATE TABLE IF NOT EXISTS "PhoneOtpChallenge" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "consumedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhoneOtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PhoneOtpChallenge_workspaceId_userId_createdAt_idx" ON "PhoneOtpChallenge"("workspaceId", "userId", "createdAt");
CREATE INDEX IF NOT EXISTS "PhoneOtpChallenge_userId_phoneE164_createdAt_idx" ON "PhoneOtpChallenge"("userId", "phoneE164", "createdAt");
CREATE INDEX IF NOT EXISTS "PhoneOtpChallenge_expiresAt_idx" ON "PhoneOtpChallenge"("expiresAt");

-- FKs
DO $$ BEGIN
  ALTER TABLE "BuyerConfirmedPreference" ADD CONSTRAINT "BuyerConfirmedPreference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BuyerConfirmedPreference" ADD CONSTRAINT "BuyerConfirmedPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PhoneOtpChallenge" ADD CONSTRAINT "PhoneOtpChallenge_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PhoneOtpChallenge" ADD CONSTRAINT "PhoneOtpChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
