/**
 * Legacy demo-agent OrganizationMembership seat authority.
 * Workspace mode: only ACTIVE Houzzat WorkspaceMembers qualify — not platform role alone.
 */
import type { OrgMembershipRole } from "@prisma/client";
import { HOUZZAT_WORKSPACE_SLUG } from "@/lib/crm-ownership";
import { prisma } from "@/lib/prisma";
import { shouldUseHostnameBoundStaffContext } from "@/lib/tenancy/tenant-staff-context";

export type BrokerageSeatTarget = {
  userId: string;
  orgRole: OrgMembershipRole;
};

/** When true, org seat sync is limited to Houzzat workspace membership. */
export function isWorkspaceScopedBrokerageSeatSync(): boolean {
  return shouldUseHostnameBoundStaffContext();
}

async function resolveHouzzatWorkspaceId(): Promise<string | null> {
  const row = await prisma.workspace.findUnique({
    where: { slug: HOUZZAT_WORKSPACE_SLUG },
    select: { id: true },
  });
  return row?.id ?? null;
}

function orgRoleForPlatformRole(role: string): OrgMembershipRole {
  return role === "ADMIN" ? "OWNER" : "AGENT";
}

/** Platform-wide legacy seat list (pre-workspace architecture). */
async function resolveLegacyPlatformSeatTargets(): Promise<BrokerageSeatTarget[]> {
  const [admins, agents] = await Promise.all([
    prisma.user.findMany({
      where: { role: "ADMIN", disabledAt: null },
      select: { id: true },
    }),
    prisma.user.findMany({
      where: { role: "AGENT", disabledAt: null },
      select: { id: true },
    }),
  ]);

  const targets: BrokerageSeatTarget[] = [];
  for (const admin of admins) {
    targets.push({ userId: admin.id, orgRole: "OWNER" });
  }
  for (const agent of agents) {
    targets.push({ userId: agent.id, orgRole: "AGENT" });
  }
  return targets;
}

/** Houzzat ACTIVE workspace members with staff platform roles. */
async function resolveHouzzatWorkspaceSeatTargets(): Promise<BrokerageSeatTarget[]> {
  const houzzatId = await resolveHouzzatWorkspaceId();
  if (!houzzatId) return [];

  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId: houzzatId,
      status: "ACTIVE",
      user: {
        disabledAt: null,
        role: { in: ["ADMIN", "AGENT"] },
      },
    },
    select: {
      userId: true,
      user: { select: { role: true } },
    },
  });

  return members.map((member) => ({
    userId: member.userId,
    orgRole: orgRoleForPlatformRole(member.user.role),
  }));
}

export async function resolveLegacyBrokerageSeatTargets(): Promise<
  BrokerageSeatTarget[]
> {
  const raw = isWorkspaceScopedBrokerageSeatSync()
    ? await resolveHouzzatWorkspaceSeatTargets()
    : await resolveLegacyPlatformSeatTargets();

  const byUser = new Map<string, BrokerageSeatTarget>();
  for (const target of raw) {
    const existing = byUser.get(target.userId);
    if (!existing || target.orgRole === "OWNER") {
      byUser.set(target.userId, target);
    }
  }
  return [...byUser.values()];
}

export async function userQualifiesForLegacyBrokerageOrgSeat(
  userId: string,
): Promise<boolean> {
  const targets = await resolveLegacyBrokerageSeatTargets();
  return targets.some((target) => target.userId === userId);
}

export async function resolveHouzzatWorkspaceIdForOrgRewrite(): Promise<
  string | null
> {
  if (!isWorkspaceScopedBrokerageSeatSync()) return null;
  return resolveHouzzatWorkspaceId();
}
