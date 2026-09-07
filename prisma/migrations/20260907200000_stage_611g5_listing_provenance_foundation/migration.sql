-- Stage 6.11G.5 / G.5A — Listing provenance foundation (additive only).
-- Hybrid: denormalized primary org/provider on Listing + canonical ListingSource rows.
-- ListingSource is canonical lineage; Listing.organizationId/providerKey mirror isPrimary.
-- providerListingKey REQUIRED (no ambiguous NULL identities).
-- PropTx providerListingKey = RESO ListingKey; sourceMlsNumber = ListingId/MlsNumber.
-- feedKey omitted (IDX/VOW-style access classes are not source identity).
-- Partial unique: at most one isPrimary=true per listingId.
-- Organization ≠ provider. No Workspace FK. No WorkspaceDataConnection ownership.
-- Does NOT change mlsNumber / listingKey uniqueness (staged later).
-- Does NOT backfill. Does NOT seed RealEstateOrganization / TRREB.
-- Does NOT enable entitlement filtering, Typesense reindex, or PropTx behavior changes.
-- FSBO/mock/manual stay unattributed (no MLS ListingSource).

ALTER TABLE "Listing" ADD COLUMN "organizationId" TEXT,
ADD COLUMN "providerKey" TEXT;

CREATE TABLE "ListingSource" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "organizationId" TEXT,
    "providerKey" TEXT NOT NULL,
    "providerListingKey" TEXT NOT NULL,
    "sourceMlsNumber" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingSource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ListingSource_listingId_isPrimary_idx" ON "ListingSource"("listingId", "isPrimary");

CREATE INDEX "ListingSource_organizationId_sourceMlsNumber_idx" ON "ListingSource"("organizationId", "sourceMlsNumber");

CREATE INDEX "ListingSource_providerKey_providerListingKey_idx" ON "ListingSource"("providerKey", "providerListingKey");

CREATE INDEX "ListingSource_organizationId_providerKey_idx" ON "ListingSource"("organizationId", "providerKey");

CREATE UNIQUE INDEX "ListingSource_listingId_providerKey_providerListingKey_key" ON "ListingSource"("listingId", "providerKey", "providerListingKey");

-- At most one primary source per Listing (Postgres partial unique).
CREATE UNIQUE INDEX "ListingSource_one_primary_per_listing_key" ON "ListingSource"("listingId") WHERE "isPrimary" = true;

CREATE INDEX "Listing_organizationId_status_idx" ON "Listing"("organizationId", "status");

CREATE INDEX "Listing_organizationId_mlsNumber_idx" ON "Listing"("organizationId", "mlsNumber");

CREATE INDEX "Listing_providerKey_listingKey_idx" ON "Listing"("providerKey", "listingKey");

ALTER TABLE "Listing" ADD CONSTRAINT "Listing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "RealEstateOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ListingSource" ADD CONSTRAINT "ListingSource_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ListingSource" ADD CONSTRAINT "ListingSource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "RealEstateOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
