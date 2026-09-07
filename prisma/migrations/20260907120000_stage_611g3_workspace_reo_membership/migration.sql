-- Stage 6.11G.3 / G.3A — Workspace ↔ RealEstateOrganization membership (additive only).
-- Corrected before apply: no membership context; UNIQUE(workspaceId, organizationId).
-- "This Workspace is affiliated with / has selected this organization."
-- Workspace is the MLS/listing-access boundary (multi-board allowed).
-- Membership ≠ DataConnection ≠ Listing entitlement.
-- Even VERIFIED grants ZERO listing rights.
-- Team members do NOT require individual MLS membership rows.
-- No seed/backfill. No RealEstateOrganization population.
-- No Listing / Typesense / PropTx / Houzzat changes.
-- No WorkspaceTeamMember / User / WorkspaceMember coupling.

CREATE TYPE "WorkspaceReoMembershipStatus" AS ENUM ('DECLARED', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'INACTIVE');

CREATE TABLE "WorkspaceRealEstateOrganizationMembership" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "membershipIdentifier" TEXT,
    "status" "WorkspaceReoMembershipStatus" NOT NULL DEFAULT 'DECLARED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceRealEstateOrganizationMembership_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkspaceRealEstateOrganizationMembership_workspaceId_statu_idx" ON "WorkspaceRealEstateOrganizationMembership"("workspaceId", "status");

CREATE INDEX "WorkspaceRealEstateOrganizationMembership_organizationId_st_idx" ON "WorkspaceRealEstateOrganizationMembership"("organizationId", "status");

CREATE UNIQUE INDEX "WorkspaceRealEstateOrganizationMembership_workspaceId_organ_key" ON "WorkspaceRealEstateOrganizationMembership"("workspaceId", "organizationId");

ALTER TABLE "WorkspaceRealEstateOrganizationMembership" ADD CONSTRAINT "WorkspaceRealEstateOrganizationMembership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceRealEstateOrganizationMembership" ADD CONSTRAINT "WorkspaceRealEstateOrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "RealEstateOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
