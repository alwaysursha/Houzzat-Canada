/**
 * Stage 5.6 — workspace-authoritative brand for token-based public Viewings share pages.
 *
 * Ignores TENANT_BRANDING_SCOPE=legacy global Houzzat fallback.
 * Never uses hostname, cookies, session, or query parameters.
 */
import { HOUZZAT_WORKSPACE_SLUG } from "@/lib/crm-ownership";
import type { WorkspaceBrandPublic } from "@/lib/tenancy/brand-dto";
import { toWorkspaceBrandPublic } from "@/lib/tenancy/brand-dto";
import { buildLegacyHouzzatBrand } from "@/lib/tenancy/legacy-houzzat-brand";
import { buildNeutralTenantBrand } from "@/lib/tenancy/neutral-tenant-brand";
import { applyPlatformFooterInvariant } from "@/lib/tenancy/platform-footer";
import { workspaceBrandingRowToBrand } from "@/lib/tenancy/resolve-workspace-brand";
import { prisma } from "@/lib/prisma";

export async function resolvePublicViewingShareBrand(
  workspaceId: string,
): Promise<WorkspaceBrandPublic> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, slug: true, name: true },
  });

  if (!workspace) {
    return toWorkspaceBrandPublic(
      applyPlatformFooterInvariant(
        buildNeutralTenantBrand(workspaceId, "Real Estate"),
      ),
    );
  }

  if (workspace.slug === HOUZZAT_WORKSPACE_SLUG) {
    return toWorkspaceBrandPublic(
      applyPlatformFooterInvariant(buildLegacyHouzzatBrand(workspace.id)),
    );
  }

  const row = await prisma.workspaceBranding.findUnique({
    where: { workspaceId: workspace.id },
  });

  if (row) {
    return toWorkspaceBrandPublic(
      applyPlatformFooterInvariant(
        workspaceBrandingRowToBrand(workspace.id, row),
      ),
    );
  }

  return toWorkspaceBrandPublic(
    applyPlatformFooterInvariant(
      buildNeutralTenantBrand(workspace.id, workspace.name),
    ),
  );
}
