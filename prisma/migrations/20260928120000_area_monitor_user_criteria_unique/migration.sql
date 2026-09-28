-- One Area Watch per customer and the same criteria the app already dedupes on:
-- userId, city, community, transaction, segment.
-- Dry-run on production before this migration: 0 AreaMonitor rows, 0 duplicate groups.
-- NULLS NOT DISTINCT treats a missing community (or segment) as one value.
-- Does not update, merge, or delete existing rows.

CREATE UNIQUE INDEX "AreaMonitor_user_criteria_key"
ON "AreaMonitor" ("userId", "city", "community", "transactionType", "segment")
NULLS NOT DISTINCT;
