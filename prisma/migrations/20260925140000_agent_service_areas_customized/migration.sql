-- AgentProfile.markets already stores the areas an agent serves.
-- This timestamp distinguishes "never chosen" from "cleared by the agent"
-- so Book-a-Demo geography is not reapplied after a manual edit.

ALTER TABLE "AgentProfile"
  ADD COLUMN IF NOT EXISTS "marketsCustomizedAt" TIMESTAMP(3);
