/**
 * Stage 6.10B — create PLATFORM WorkspaceDomain for a provisioned workspace.
 * Sequential Neon HTTP-safe writes only — no Prisma interactive transactions
 * and no consequential updateMany on this path.
 */
import type { PrismaClient, WorkspaceDomain } from "@prisma/client";
import {
  assertHostnameClaimable,
  assertPlatformDomainMatchesSlug,
} from "@/lib/tenancy/reserved-domains";
import { platformHostnameForWorkspaceSlug } from "@/lib/tenancy/platform-hostname";

export type EnsurePlatformDomainResult =
  | {
      outcome: "created" | "already_matches";
      hostname: string;
      domainId: string;
    }
  | {
      outcome: "failed";
      hostname: string | null;
      error: string;
    };

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function domainMatchesExpected(
  row: Pick<
    WorkspaceDomain,
    "workspaceId" | "hostname" | "kind" | "role" | "status"
  >,
  input: { workspaceId: string; hostname: string },
): boolean {
  return (
    row.workspaceId === input.workspaceId &&
    row.hostname === input.hostname &&
    row.kind === "PLATFORM" &&
    row.role === "PRIMARY" &&
    row.status === "ACTIVE"
  );
}

/**
 * Idempotent PLATFORM PRIMARY ACTIVE domain for `{slug}.houzzatpro.com`.
 * Never reassigns ownership or silently repairs wrong rows.
 */
export async function ensureWorkspacePlatformDomain(input: {
  prisma: PrismaClient;
  workspaceId: string;
  now?: Date;
}): Promise<EnsurePlatformDomainResult> {
  const db = input.prisma;
  const now = input.now ?? new Date();

  const workspace = await db.workspace.findUnique({
    where: { id: input.workspaceId },
    select: { id: true, slug: true },
  });
  if (!workspace) {
    return {
      outcome: "failed",
      hostname: null,
      error: "Workspace missing for platform domain provisioning",
    };
  }

  const derived = platformHostnameForWorkspaceSlug(workspace.slug);
  if (!derived.ok) {
    return {
      outcome: "failed",
      hostname: null,
      error: `Invalid workspace slug for platform hostname: ${derived.error}`,
    };
  }
  const hostname = derived.hostname;

  const claimError = assertHostnameClaimable({
    hostname,
    kind: "PLATFORM",
    workspaceSlug: workspace.slug,
    trustedPlatformSeed: true,
  });
  if (claimError) {
    return { outcome: "failed", hostname, error: claimError };
  }

  const slugMatchError = assertPlatformDomainMatchesSlug({
    hostname,
    workspaceSlug: workspace.slug,
  });
  if (slugMatchError) {
    return { outcome: "failed", hostname, error: slugMatchError };
  }

  const byHostname = await db.workspaceDomain.findUnique({
    where: { hostname },
    select: {
      id: true,
      workspaceId: true,
      hostname: true,
      kind: true,
      role: true,
      status: true,
    },
  });

  const byPlatform = await db.workspaceDomain.findFirst({
    where: { workspaceId: workspace.id, kind: "PLATFORM" },
    select: {
      id: true,
      workspaceId: true,
      hostname: true,
      kind: true,
      role: true,
      status: true,
    },
  });

  if (byHostname && byHostname.workspaceId !== workspace.id) {
    return {
      outcome: "failed",
      hostname,
      error: `Platform hostname already owned by another workspace`,
    };
  }

  if (byPlatform && byPlatform.hostname !== hostname) {
    return {
      outcome: "failed",
      hostname,
      error: `Workspace already has a different PLATFORM domain (${byPlatform.hostname})`,
    };
  }

  if (byHostname) {
    if (
      domainMatchesExpected(byHostname, {
        workspaceId: workspace.id,
        hostname,
      })
    ) {
      return {
        outcome: "already_matches",
        hostname,
        domainId: byHostname.id,
      };
    }
    return {
      outcome: "failed",
      hostname,
      error:
        "Existing WorkspaceDomain for platform hostname has incorrect kind/role/status",
    };
  }

  if (byPlatform) {
    // Hostname row missing but PLATFORM exists under unexpected hostname —
    // already handled above; defensive guard.
    return {
      outcome: "failed",
      hostname,
      error: `Workspace already has a different PLATFORM domain (${byPlatform.hostname})`,
    };
  }

  try {
    const created = await db.workspaceDomain.create({
      data: {
        workspaceId: workspace.id,
        hostname,
        kind: "PLATFORM",
        role: "PRIMARY",
        status: "ACTIVE",
        verifiedAt: now,
        verificationToken: null,
      },
      select: { id: true },
    });
    return {
      outcome: "created",
      hostname,
      domainId: created.id,
    };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    const raced = await db.workspaceDomain.findUnique({
      where: { hostname },
      select: {
        id: true,
        workspaceId: true,
        hostname: true,
        kind: true,
        role: true,
        status: true,
      },
    });
    if (
      raced &&
      domainMatchesExpected(raced, { workspaceId: workspace.id, hostname })
    ) {
      return {
        outcome: "already_matches",
        hostname,
        domainId: raced.id,
      };
    }
    if (raced && raced.workspaceId !== workspace.id) {
      return {
        outcome: "failed",
        hostname,
        error: `Platform hostname already owned by another workspace`,
      };
    }
    return {
      outcome: "failed",
      hostname,
      error:
        "Platform hostname create raced with an incompatible WorkspaceDomain row",
    };
  }
}
