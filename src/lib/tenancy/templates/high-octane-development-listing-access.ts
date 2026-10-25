/**
 * Session gate for HIGH OCTANE development fixtures.
 * A query string cannot enable the mode. Houzzat entitlement is never read.
 */
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import {
  readItsoLiveSourceInput,
  readItsoSourceRequest,
} from "@/lib/listings/itso/itso-source-preference";
import type { ItsoLiveSourceInput, ItsoSourceRequest } from "@/lib/listings/itso/itso-sources";
import {
  decideHighOctaneDevelopmentListingAccess,
  highOctaneDevelopmentListingWorkspaceSlug,
  highOctaneDevelopmentListingsEnabled,
  type HighOctaneDevelopmentListingDecision,
} from "@/lib/tenancy/templates/high-octane-development-listings";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "@/lib/tenancy/templates/high-octane-staging-slug";

async function readSavedItsoSource(
  workspaceSlug: string | null,
): Promise<{ requested: ItsoSourceRequest | null; live?: ItsoLiveSourceInput }> {
  if (workspaceSlug !== HIGH_OCTANE_STAGING_WORKSPACE_SLUG) return { requested: null };
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { slug: workspaceSlug },
      select: { id: true },
    });
    if (!workspace) return { requested: null };
    const [requested, live] = await Promise.all([
      readItsoSourceRequest(workspace.id),
      readItsoLiveSourceInput(workspace.id),
    ]);
    return { requested, live };
  } catch {
    return { requested: null };
  }
}

export async function loadHighOctaneDevelopmentListingAccess(input: {
  workspaceSlug: string | null;
  userId: string | null;
  env?: NodeJS.ProcessEnv;
}): Promise<HighOctaneDevelopmentListingDecision> {
  const env = input.env ?? process.env;
  const host = input.workspaceSlug === HIGH_OCTANE_STAGING_WORKSPACE_SLUG;
  const saved = await readSavedItsoSource(input.workspaceSlug);
  if (!highOctaneDevelopmentListingsEnabled(env) || !host || !input.userId) {
    return decideHighOctaneDevelopmentListingAccess({
      env,
      workspaceSlug: input.workspaceSlug,
      actor: null,
      requested: saved.requested,
      live: saved.live,
    });
  }

  const [operator, user, membership] = await Promise.all([
    prisma.platformOperator.findUnique({
      where: { userId: input.userId },
      select: { role: true, status: true },
    }),
    prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true },
    }),
    prisma.workspaceMember.findFirst({
      where: {
        userId: input.userId,
        status: "ACTIVE",
        workspace: { slug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG },
      },
      select: { id: true },
    }),
  ]);

  return decideHighOctaneDevelopmentListingAccess({
    env,
    workspaceSlug: input.workspaceSlug,
    requested: saved.requested,
    live: saved.live,
    actor: {
      email: user?.email ?? null,
      masterAdminActive:
        operator?.role === "MASTER_ADMIN" && operator.status === "ACTIVE",
      highOctaneMembershipActive: Boolean(membership),
    },
  });
}

export async function loadHighOctaneDevelopmentListingAccessForRequest(
  request: Request,
  workspaceSlug: string | null,
): Promise<HighOctaneDevelopmentListingDecision> {
  const slug = highOctaneDevelopmentListingWorkspaceSlug({
    workspaceSlug,
    hostname: extractTrustedRequestHostname(request),
  });
  if (slug !== HIGH_OCTANE_STAGING_WORKSPACE_SLUG) {
    return decideHighOctaneDevelopmentListingAccess({
      workspaceSlug: slug,
      actor: null,
    });
  }
  const session = highOctaneDevelopmentListingsEnabled() ? await auth() : null;
  return loadHighOctaneDevelopmentListingAccess({
    workspaceSlug: slug,
    userId: session?.user?.id ?? null,
  });
}
