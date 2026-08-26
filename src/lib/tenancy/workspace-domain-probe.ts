/**
 * Stage 3K.4.3 — pre-migration-safe WorkspaceDomain read helpers.
 * Never implicitly select `kind` — safe before 3K.4.2 migration is applied.
 */
import type {
  PrismaClient,
  WorkspaceDomainKind,
  WorkspaceDomainRole,
  WorkspaceDomainStatus,
} from "@prisma/client";
import {
  inferWorkspaceDomainKind,
  isPrismaMissingWorkspaceDomainKindColumn,
} from "@/lib/tenancy/infer-workspace-domain-kind";

/** Explicit select — excludes `kind` column for pre-3K.4.2 DB compatibility. */
export const WORKSPACE_DOMAIN_PROBE_SELECT = {
  id: true,
  hostname: true,
  role: true,
  status: true,
  workspaceId: true,
  verifiedAt: true,
} as const;

export const WORKSPACE_DOMAIN_PROBE_WITH_WORKSPACE_SELECT = {
  ...WORKSPACE_DOMAIN_PROBE_SELECT,
  workspace: { select: { slug: true, status: true } },
} as const;

export type WorkspaceDomainProbeRow = {
  id: string;
  hostname: string;
  role: WorkspaceDomainRole;
  status: WorkspaceDomainStatus;
  workspaceId: string;
  verifiedAt: Date | null;
  workspaceSlug: string;
  kind: WorkspaceDomainKind;
};

type ProbeBase = {
  id: string;
  hostname: string;
  role: WorkspaceDomainRole;
  status: WorkspaceDomainStatus;
  workspaceId: string;
  verifiedAt: Date | null;
};

function withInferredKind(
  row: ProbeBase,
  workspaceSlug: string,
  storedKind?: WorkspaceDomainKind | null,
): WorkspaceDomainProbeRow {
  return {
    ...row,
    workspaceSlug,
    kind: inferWorkspaceDomainKind({
      hostname: row.hostname,
      workspaceSlug,
      storedKind,
    }),
  };
}

async function readStoredKind(
  prisma: PrismaClient,
  hostname: string,
): Promise<WorkspaceDomainKind | null> {
  try {
    const row = await prisma.workspaceDomain.findUnique({
      where: { hostname },
      select: { kind: true },
    });
    return row?.kind ?? null;
  } catch (error) {
    if (isPrismaMissingWorkspaceDomainKindColumn(error)) return null;
    throw error;
  }
}

export async function listWorkspaceDomainsForProbe(
  prisma: PrismaClient,
  workspaceId: string,
  workspaceSlug: string,
): Promise<WorkspaceDomainProbeRow[]> {
  const rows = await prisma.workspaceDomain.findMany({
    where: { workspaceId },
    select: WORKSPACE_DOMAIN_PROBE_SELECT,
  });
  const enriched = await Promise.all(
    rows.map(async (row) =>
      withInferredKind(
        row,
        workspaceSlug,
        await readStoredKind(prisma, row.hostname),
      ),
    ),
  );
  return enriched;
}

export async function findWorkspaceDomainByHostnameForProbe(
  prisma: PrismaClient,
  hostname: string,
  workspaceSlug: string,
): Promise<WorkspaceDomainProbeRow | null> {
  const row = await prisma.workspaceDomain.findUnique({
    where: { hostname },
    select: WORKSPACE_DOMAIN_PROBE_SELECT,
  });
  if (!row) return null;
  const storedKind = await readStoredKind(prisma, hostname);
  return withInferredKind(row, workspaceSlug, storedKind);
}

export async function findWorkspaceDomainForWorkspaceHostForProbe(
  prisma: PrismaClient,
  workspaceId: string,
  workspaceSlug: string,
  hostname: string,
): Promise<WorkspaceDomainProbeRow | null> {
  const row = await prisma.workspaceDomain.findFirst({
    where: { workspaceId, hostname },
    select: WORKSPACE_DOMAIN_PROBE_SELECT,
  });
  if (!row) return null;
  const storedKind = await readStoredKind(prisma, hostname);
  return withInferredKind(row, workspaceSlug, storedKind);
}

/** Resolver lookup — pre-migration safe, enriches with inferred/stored kind. */
export async function lookupActiveWorkspaceDomainRow(
  prisma: PrismaClient,
  hostname: string,
): Promise<{
  hostname: string;
  kind: WorkspaceDomainKind;
  role: WorkspaceDomainRole;
  status: WorkspaceDomainStatus;
  workspaceId: string;
  workspaceSlug: string;
  workspaceStatus: "ACTIVE" | "TRIAL" | "SUSPENDED" | "CANCELLED";
} | null> {
  const row = await prisma.workspaceDomain.findUnique({
    where: { hostname },
    select: WORKSPACE_DOMAIN_PROBE_WITH_WORKSPACE_SELECT,
  });
  if (!row) return null;
  const storedKind = await readStoredKind(prisma, hostname);
  return {
    hostname: row.hostname,
    kind: inferWorkspaceDomainKind({
      hostname: row.hostname,
      workspaceSlug: row.workspace.slug,
      storedKind,
    }),
    role: row.role,
    status: row.status,
    workspaceId: row.workspaceId,
    workspaceSlug: row.workspace.slug,
    workspaceStatus: row.workspace.status,
  };
}
