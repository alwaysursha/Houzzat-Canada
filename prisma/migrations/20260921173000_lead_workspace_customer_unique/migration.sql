-- Durable Lead identity: one non-null customer + one Workspace = one Lead.
-- Partial unique so multiple customerId = null orphan Leads remain allowed.
-- Does not attach, rewrite, or delete existing null-customer Leads.
-- No routing, ownership, or MLS changes.

CREATE UNIQUE INDEX "Lead_workspaceId_customerId_nonnull_key"
ON "Lead" ("workspaceId", "customerId")
WHERE "customerId" IS NOT NULL;
