-- Durable 24h automatic "Verify your email" due/sent lease markers.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifyNudgeDueAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifyNudgeSentAt" TIMESTAMP(3);

-- Pending-queue partial index (Prisma schema cannot express WHERE).
-- Matches listDue for unclaimed rows: unverified, unclaimed, not disabled, ordered by due.
CREATE INDEX IF NOT EXISTS "User_emailVerifyNudge_pending_idx"
  ON "User" ("emailVerifyNudgeDueAt")
  WHERE "emailVerified" IS NULL
    AND "emailVerifyNudgeSentAt" IS NULL
    AND "disabledAt" IS NULL;
