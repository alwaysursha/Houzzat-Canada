-- Media sync completion state.
-- A photo count under 5 is not incomplete once mediaSourceTimestamp is set.
-- Does not revive or advance the historical Media cursor.

ALTER TABLE "Listing" ADD COLUMN "photosChangeTimestamp" TIMESTAMP(3);
ALTER TABLE "Listing" ADD COLUMN "mediaSourceTimestamp" TIMESTAMP(3);
ALTER TABLE "Listing" ADD COLUMN "mediaSyncedAt" TIMESTAMP(3);
