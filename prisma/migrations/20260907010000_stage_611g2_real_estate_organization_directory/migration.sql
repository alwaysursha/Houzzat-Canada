-- Stage 6.11G.2 — Real estate organization / MLS directory foundation (additive only).
-- Platform catalog only. Empty tables — no seed/backfill.
-- Not tenant entitlement. Not listing inventory. Not credentials.
-- Distinct from legacy CRM "Organization".
-- No Listing / Typesense / PropTx / Workspace changes.

CREATE TYPE "RealEstateOrganizationKind" AS ENUM ('BOARD', 'ASSOCIATION', 'MLS', 'DATA_SYSTEM', 'OTHER');

CREATE TYPE "RealEstateOrganizationSupportStatus" AS ENUM ('SUPPORTED', 'PLANNED', 'UNSUPPORTED');

CREATE TABLE "RealEstateOrganization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "shortName" TEXT,
    "countryCode" TEXT NOT NULL,
    "regionCode" TEXT,
    "kind" "RealEstateOrganizationKind" NOT NULL,
    "supportStatus" "RealEstateOrganizationSupportStatus" NOT NULL DEFAULT 'UNSUPPORTED',
    "officialUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RealEstateOrganization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RealEstateOrganization_slug_key" ON "RealEstateOrganization"("slug");

CREATE INDEX "RealEstateOrganization_countryCode_regionCode_active_idx" ON "RealEstateOrganization"("countryCode", "regionCode", "active");

CREATE INDEX "RealEstateOrganization_countryCode_kind_active_idx" ON "RealEstateOrganization"("countryCode", "kind", "active");

CREATE INDEX "RealEstateOrganization_supportStatus_active_idx" ON "RealEstateOrganization"("supportStatus", "active");

CREATE INDEX "RealEstateOrganization_countryCode_name_idx" ON "RealEstateOrganization"("countryCode", "name");

CREATE INDEX "RealEstateOrganization_shortName_idx" ON "RealEstateOrganization"("shortName");
