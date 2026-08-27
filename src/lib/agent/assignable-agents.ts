/**
 * Resolve assignable staff for CRM reassignment pickers.
 * Workspace read mode → ACTIVE WorkspaceMembers only (no org-wide / platform-wide).
 */
import type { AgentOrgContext } from "@/lib/agent";
import { isActiveHostnameBoundReadMode } from "@/lib/crm-read-scope";
import { prisma } from "@/lib/prisma";

export type AssignableAgentOption = {
  user: { id: string; name: string | null; email: string };
};

export async function listAssignableCrmAgents(
  ctx: AgentOrgContext,
): Promise<AssignableAgentOption[]> {
  if (!ctx.canSeeTeamLeads) return [];

  if (isActiveHostnameBoundReadMode()) {
    if (!ctx.workspaceId || !ctx.isWorkspaceCrmAllowed) return [];
    const members = await prisma.workspaceMember.findMany({
      where: {
        workspaceId: ctx.workspaceId,
        status: "ACTIVE",
        user: {
          disabledAt: null,
          role: { in: ["AGENT", "ADMIN"] },
        },
      },
      select: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ user: { name: "asc" } }, { user: { email: "asc" } }],
      take: 100,
    });
    return members;
  }

  if (ctx.isPlatformAdmin) {
    const users = await prisma.user.findMany({
      where: {
        role: { in: ["AGENT", "ADMIN"] },
        disabledAt: null,
      },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      take: 100,
    });
    return users.map((user) => ({ user }));
  }

  const members = await prisma.organizationMembership.findMany({
    where: { organizationId: { in: ctx.organizationIds } },
    select: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return members;
}
