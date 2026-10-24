/**
 * Session gate for HIGH OCTANE development fixtures.
 * A query string cannot enable the mode. Houzzat entitlement is never read.
 */
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  decideHighOctaneDevelopmentListingAccess,
  highOctaneDevelopmentListingsEnabled,
  type HighOctaneDevelopmentListingDecision,
} from "@/lib/tenancy/templates/high-octane-development-listings";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "@/lib/tenancy/templates/high-octane-staging-slug";

export async function loadHighOctaneDevelopmentListingAccess(input: {
  workspaceSlug: string | null;
  userId: string | null;
  env?: NodeJS.ProcessEnv;
}): Promise<HighOctaneDevelopmentListingDecision> {
  const env = input.env ?? process.env;
  const host = input.workspaceSlug === HIGH_OCTANE_STAGING_WORKSPACE_SLUG;
  if (!highOctaneDevelopmentListingsEnabled(env) || !host || !input.userId) {
    return decideHighOctaneDevelopmentListingAccess({
      env,
      workspaceSlug: input.workspaceSlug,
      actor: null,
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
  void request;
  if (
    !highOctaneDevelopmentListingsEnabled() ||
    workspaceSlug !== HIGH_OCTANE_STAGING_WORKSPACE_SLUG
  ) {
    return decideHighOctaneDevelopmentListingAccess({
      workspaceSlug,
      actor: null,
    });
  }
  const session = await auth();
  return loadHighOctaneDevelopmentListingAccess({
    workspaceSlug,
    userId: session?.user?.id ?? null,
  });
}
