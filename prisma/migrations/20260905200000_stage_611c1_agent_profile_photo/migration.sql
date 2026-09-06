-- Stage 6.11C.1 — Tenant brand assets foundation (additive only)
-- Workspace-level agent profile photo for Agent-category website templates.
-- No destructive changes.

ALTER TABLE "WorkspaceBranding"
  ADD COLUMN "agentProfilePhotoUrl" TEXT;
