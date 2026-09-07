-- Stage 6.11G.4 / G.4A — Workspace listing-data connection foundation (additive only).
-- AUTHORIZATION / integration layer — not membership, not listing entitlement filter.
-- Membership ≠ DataConnection ≠ Listing entitlement.
-- Only future ACTIVE + DATA capabilities may contribute inventory (resolver not built).
-- Capability enum is DATA/inventory only (ACTIVE_LISTINGS/SOLD/HISTORY/OPEN_HOUSES/MEDIA).
-- IDX/VOW and other board access/display policies are NOT universal capabilities —
-- map in provider adapters; optional future policy persistence stays separate.
-- Organization and providerKey are first-class and distinct.
-- No FK to membership (service validates matching membership before ACTIVE).
-- credentialRef opaque only — no raw secrets. No PropTx credential migration.
-- No seed/backfill. No RealEstateOrganization / membership population.
-- No Listing / Typesense / PropTx / Houzzat / preview changes.
-- No User / WorkspaceMember / WorkspaceTeamMember ownership FKs.

CREATE TYPE "WorkspaceDataConnectionStatus" AS ENUM ('PENDING', 'ACTIVE', 'FAILED', 'SUSPENDED', 'REVOKED', 'DISCONNECTED');

CREATE TYPE "WorkspaceDataConnectionCapabilityKind" AS ENUM ('ACTIVE_LISTINGS', 'SOLD', 'HISTORY', 'OPEN_HOUSES', 'MEDIA');

CREATE TABLE "WorkspaceDataConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "status" "WorkspaceDataConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "credentialRef" TEXT,
    "externalConnectionIdentifier" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "lastSuccessfulAccessAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceDataConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceDataConnectionCapability" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "capability" "WorkspaceDataConnectionCapabilityKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceDataConnectionCapability_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkspaceDataConnection_workspaceId_status_idx" ON "WorkspaceDataConnection"("workspaceId", "status");

CREATE INDEX "WorkspaceDataConnection_organizationId_status_idx" ON "WorkspaceDataConnection"("organizationId", "status");

CREATE INDEX "WorkspaceDataConnection_providerKey_status_idx" ON "WorkspaceDataConnection"("providerKey", "status");

CREATE UNIQUE INDEX "WorkspaceDataConnection_workspaceId_organizationId_provider_key" ON "WorkspaceDataConnection"("workspaceId", "organizationId", "providerKey");

CREATE INDEX "WorkspaceDataConnectionCapability_capability_idx" ON "WorkspaceDataConnectionCapability"("capability");

CREATE UNIQUE INDEX "WorkspaceDataConnectionCapability_connectionId_capability_key" ON "WorkspaceDataConnectionCapability"("connectionId", "capability");

ALTER TABLE "WorkspaceDataConnection" ADD CONSTRAINT "WorkspaceDataConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceDataConnection" ADD CONSTRAINT "WorkspaceDataConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "RealEstateOrganization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkspaceDataConnectionCapability" ADD CONSTRAINT "WorkspaceDataConnectionCapability_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "WorkspaceDataConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
