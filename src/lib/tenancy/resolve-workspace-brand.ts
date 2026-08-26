/**
 * Stage 3K.2 — central workspace brand resolver.
 */
import type { WorkspaceBranding } from "@prisma/client";
import type { WorkspaceBrandInternal } from "@/lib/tenancy/brand-dto";
import {
  readBrandCache,
  writeBrandCache,
} from "@/lib/tenancy/brand-cache";
import { validateOptionalBrandColor } from "@/lib/tenancy/brand-colors";
import { enforcePoweredByHouzzatPro } from "@/lib/tenancy/brand-capabilities";
import { applyPlatformFooterInvariant } from "@/lib/tenancy/platform-footer";
import { buildLegacyHouzzatBrand } from "@/lib/tenancy/legacy-houzzat-brand";
import { buildNeutralTenantBrand } from "@/lib/tenancy/neutral-tenant-brand";
import { isTenantBrandingScopeWorkspace } from "@/lib/tenancy/tenant-scope-flags";
import { prisma } from "@/lib/prisma";

function resolvedColor(
  raw: string | null | undefined,
  fallback: string,
): string {
  const result = validateOptionalBrandColor(raw);
  if (result.ok && result.value) return result.value;
  return fallback;
}

function mapRowToBrand(
  workspaceId: string,
  row: WorkspaceBranding,
): WorkspaceBrandInternal {
  const neutral = buildNeutralTenantBrand(workspaceId, row.displayName);

  const brand: WorkspaceBrandInternal = {
    workspaceId,
    source: "workspace_row",
    tier: row.tier,
    displayName: row.displayName,
    staffDisplayName: row.displayName,
    tagline: row.tagline ?? neutral.tagline,
    logoUrl: row.logoUrl,
    brokerageLogoUrl: row.brokerageLogoUrl,
    faviconUrl: row.faviconUrl,
    ogImageUrl: row.ogImageUrl,
    colors: {
      primary: resolvedColor(row.primaryColor, neutral.colors.primary),
      secondary: resolvedColor(row.secondaryColor, neutral.colors.secondary),
      accent: resolvedColor(row.accentColor, neutral.colors.accent),
      surface: neutral.colors.surface,
      ink: neutral.colors.ink,
    },
    contact: {
      email: row.contactEmail,
      phone: row.contactPhone,
    },
    footerLegalText: row.footerLegalText,
    poweredByHouzzatPro: enforcePoweredByHouzzatPro(row.poweredByHouzzatPro),
    seoDescription: row.seoDescription ?? row.tagline ?? neutral.seoDescription,
    version: row.version,
  };
  return applyPlatformFooterInvariant(brand);
}

/** Map DB row — exported for tests with fixture rows. */
export function workspaceBrandingRowToBrand(
  workspaceId: string,
  row: WorkspaceBranding,
): WorkspaceBrandInternal {
  return mapRowToBrand(workspaceId, row);
}

/**
 * Resolve normalized brand for a workspace.
 * Legacy scope: always legacy Houzzat (zero production behavior change).
 * Workspace scope: DB row → neutral default (never Houzzat fallback).
 */
export async function resolveWorkspaceBrand(
  workspaceId: string,
): Promise<WorkspaceBrandInternal> {
  if (!isTenantBrandingScopeWorkspace()) {
    return applyPlatformFooterInvariant(buildLegacyHouzzatBrand(workspaceId));
  }

  const row = await prisma.workspaceBranding.findUnique({
    where: { workspaceId },
  });

  if (!row) {
    return applyPlatformFooterInvariant(buildNeutralTenantBrand(workspaceId));
  }

  const cached = readBrandCache(workspaceId, row.version);
  if (cached) return cached;

  const brand = mapRowToBrand(workspaceId, row);
  writeBrandCache(brand);
  return brand;
}
