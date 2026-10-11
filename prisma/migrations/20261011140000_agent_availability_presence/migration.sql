-- Chat V1 Milestone 4H — agent availability preference + presence TTL on AgentProfile.
-- Additive only: new enum, NOT NULL preference with default, nullable presenceUntil.
-- Does not alter AgentProfile.active, routing, assignment, or eligibility.
-- Does not modify the unapplied Conversation typing-indicator migration.

-- CreateEnum
CREATE TYPE "AgentAvailabilityPreference" AS ENUM ('AVAILABLE', 'AWAY');

-- AlterTable
ALTER TABLE "AgentProfile"
  ADD COLUMN "availabilityPreference" "AgentAvailabilityPreference" NOT NULL DEFAULT 'AVAILABLE',
  ADD COLUMN "presenceUntil" TIMESTAMP(3);
