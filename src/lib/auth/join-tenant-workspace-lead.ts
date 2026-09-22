import { captureWebsiteLead } from "@/lib/agent/lead-intake";
import { prisma } from "@/lib/prisma";
import { isConsumerRole } from "@/lib/roles";
import { resolveRequestTenancy } from "@/lib/tenancy/resolve-request-tenancy";

export type TenantLeadJoinResult = {
  workspaceId: string | null;
  leadId: string | null;
  assignedAgentId: string | null;
  created: boolean;
};

type CaptureLead = typeof captureWebsiteLead;

type JoinDeps = {
  resolveTenancy?: (
    request: Request,
  ) => Promise<{ ok: true; workspaceId: string } | { ok: false }>;
  capture?: CaptureLead;
  hasActiveWorkspaceMembership?: (
    userId: string,
    workspaceId: string,
  ) => Promise<boolean>;
};

const emptyJoin: TenantLeadJoinResult = {
  workspaceId: null,
  leadId: null,
  assignedAgentId: null,
  created: false,
};

/**
 * After a consumer signs in on a tenant hostname, open that workspace's Lead
 * through the existing capture path. Other workspaces are not read or written.
 */
export async function joinConsumerToTenantWorkspaceLead(
  input: {
    user: {
      id: string;
      email: string;
      name: string | null;
      role: string;
      isBuyer: boolean;
      isSeller: boolean;
    };
    request: Request | null;
  },
  deps?: JoinDeps,
): Promise<TenantLeadJoinResult> {
  if (!input.request || !isConsumerRole(input.user.role)) return emptyJoin;

  const capture = deps?.capture ?? captureWebsiteLead;
  let workspaceId: string | null = null;

  try {
    const tenancy = deps?.resolveTenancy
      ? await deps.resolveTenancy(input.request)
      : await resolveRequestTenancy(input.request);
    if (!tenancy.ok) return emptyJoin;
    workspaceId = tenancy.workspaceId;

    const hasMembership = deps?.hasActiveWorkspaceMembership
      ? await deps.hasActiveWorkspaceMembership(input.user.id, workspaceId)
      : await prisma.workspaceMember.findFirst({
          where: {
            userId: input.user.id,
            workspaceId,
            status: "ACTIVE",
            workspace: { status: "ACTIVE" },
          },
          select: { id: true },
        });
    if (hasMembership) {
      return { ...emptyJoin, workspaceId };
    }

    const captured = await capture({
      source: "OTHER",
      customerId: input.user.id,
      email: input.user.email,
      name: input.user.name,
      isBuyer: input.user.isBuyer,
      isSeller: input.user.isSeller,
      actorId: input.user.id,
      request: input.request,
      notes: "Customer signed in on this workspace.",
      activityOnReuse: false,
    });

    return {
      workspaceId: captured.lead.workspaceId,
      leadId: captured.lead.id,
      assignedAgentId: captured.assignedAgentId,
      created: captured.created,
    };
  } catch (error) {
    console.error("[auth] tenant workspace lead join failed", error);
    return { ...emptyJoin, workspaceId };
  }
}
