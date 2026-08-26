-- Stage 3K.2 — additive tenant domain + branding foundation (NOT applied to production by Cursor)
-- CreateEnum
CREATE TYPE "WorkspaceDomainRole" AS ENUM ('PRIMARY', 'ALIAS');

-- CreateEnum
CREATE TYPE "WorkspaceDomainStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "BrandingTier" AS ENUM ('GENERIC', 'SEMI_BRANDED', 'FULL_BRANDED');

-- CreateTable
CREATE TABLE "WorkspaceDomain" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "role" "WorkspaceDomainRole" NOT NULL,
    "status" "WorkspaceDomainStatus" NOT NULL DEFAULT 'PENDING',
    "verificationToken" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceBranding" (
    "workspaceId" TEXT NOT NULL,
    "tier" "BrandingTier" NOT NULL DEFAULT 'SEMI_BRANDED',
    "displayName" TEXT NOT NULL,
    "tagline" TEXT,
    "logoUrl" TEXT,
    "brokerageLogoUrl" TEXT,
    "faviconUrl" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "accentColor" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "footerLegalText" TEXT,
    "poweredByHouzzatPro" BOOLEAN NOT NULL DEFAULT true,
    "seoDescription" TEXT,
    "ogImageUrl" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceBranding_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceDomain_hostname_key" ON "WorkspaceDomain"("hostname");

-- CreateIndex
CREATE INDEX "WorkspaceDomain_workspaceId_idx" ON "WorkspaceDomain"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceDomain_workspaceId_status_idx" ON "WorkspaceDomain"("workspaceId", "status");

-- Partial unique index: at most one PRIMARY domain per workspace.
-- Prisma schema cannot express this; enforced in SQL (Postgres/Neon).
CREATE UNIQUE INDEX "WorkspaceDomain_one_primary_per_workspace"
    ON "WorkspaceDomain"("workspaceId")
    WHERE "role" = 'PRIMARY';

-- AddForeignKey
ALTER TABLE "WorkspaceDomain" ADD CONSTRAINT "WorkspaceDomain_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceBranding" ADD CONSTRAINT "WorkspaceBranding_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
