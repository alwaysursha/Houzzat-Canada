/**
 * Stage 3D — Core CRM dual-write (organizationId remains authoritative for reads).
 */
import { prisma } from "@/lib/prisma";

export const LEGACY_CRM_ORGANIZATION_SLUG = "demo-agent";
export const HOUZZAT_WORKSPACE_SLUG = "houzzat";

const MAPPING_CACHE_MS = 5 * 60 * 1000;

type TenancyMapping = {
  demoAgentOrgId: string;
  houzzatWorkspaceId: string;
};

let mappingCache: { mapping: TenancyMapping; at: number } | null = null;

export function isWorkspaceDualWriteEnabled(): boolean {
  const flag = process.env.WORKSPACE_DUAL_WRITE?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  return true;
}

export function clearTenancyMappingCache(): void {
  mappingCache = null;
}

async function loadTenancyMapping(): Promise<TenancyMapping> {
  if (mappingCache && Date.now() - mappingCache.at < MAPPING_CACHE_MS) {
    return mappingCache.mapping;
  }

  const [demoAgentOrg, houzzatWorkspace] = await Promise.all([
    prisma.organization.findUnique({
      where: { slug: LEGACY_CRM_ORGANIZATION_SLUG },
      select: { id: true },
    }),
    prisma.workspace.findUnique({
      where: { slug: HOUZZAT_WORKSPACE_SLUG },
      select: { id: true, status: true },
    }),
  ]);

  if (!demoAgentOrg) {
    const message = `[tenancy] legacy organization "${LEGACY_CRM_ORGANIZATION_SLUG}" not found`;
    console.error(message);
    throw new Error(message);
  }
  if (!houzzatWorkspace) {
    const message = `[tenancy] workspace "${HOUZZAT_WORKSPACE_SLUG}" not found`;
    console.error(message);
    throw new Error(message);
  }
  if (houzzatWorkspace.status !== "ACTIVE") {
    const message = `[tenancy] workspace "${HOUZZAT_WORKSPACE_SLUG}" is not ACTIVE`;
    console.error(message);
    throw new Error(message);
  }

  const mapping = {
    demoAgentOrgId: demoAgentOrg.id,
    houzzatWorkspaceId: houzzatWorkspace.id,
  };
  mappingCache = { mapping, at: Date.now() };
  return mapping;
}

export function workspaceIdForOrganization(
  organizationId: string,
  mapping: TenancyMapping,
): string | null {
  if (organizationId === mapping.demoAgentOrgId) {
    return mapping.houzzatWorkspaceId;
  }
  return null;
}

function assertWorkspaceIdForMappedOrg(
  organizationId: string,
  workspaceId: string | null | undefined,
  mapping: TenancyMapping,
): void {
  if (!isWorkspaceDualWriteEnabled()) return;

  const expected = workspaceIdForOrganization(organizationId, mapping);
  if (expected && !workspaceId) {
    const message = `[tenancy] null-write guard: workspaceId required for organization ${organizationId.slice(0, 8)} (demo-agent bridge)`;
    console.error(message, { organizationId });
    throw new Error(message);
  }
}

export async function resolveLeadCrmOwnership(
  organizationId: string | null | undefined,
): Promise<{ organizationId?: string; workspaceId?: string }> {
  if (!organizationId) return {};

  if (!isWorkspaceDualWriteEnabled()) {
    return { organizationId };
  }

  const mapping = await loadTenancyMapping();
  const workspaceId = workspaceIdForOrganization(organizationId, mapping);
  assertWorkspaceIdForMappedOrg(organizationId, workspaceId, mapping);

  return {
    organizationId,
    workspaceId: workspaceId ?? undefined,
  };
}

export async function resolveChildCrmOwnership(input: {
  organizationId: string;
  leadId?: string | null;
  leadWorkspaceId?: string | null;
}): Promise<{ organizationId: string; workspaceId?: string }> {
  if (!isWorkspaceDualWriteEnabled()) {
    return { organizationId: input.organizationId };
  }

  const mapping = await loadTenancyMapping();
  let workspaceId = input.leadWorkspaceId ?? null;

  if (input.leadId && workspaceId == null) {
    const lead = await prisma.lead.findUnique({
      where: { id: input.leadId },
      select: { workspaceId: true },
    });
    workspaceId = lead?.workspaceId ?? null;
  }

  if (workspaceId == null) {
    workspaceId = workspaceIdForOrganization(input.organizationId, mapping);
  }

  assertWorkspaceIdForMappedOrg(input.organizationId, workspaceId, mapping);

  return {
    organizationId: input.organizationId,
    workspaceId: workspaceId ?? undefined,
  };
}
