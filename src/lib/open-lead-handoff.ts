/**
 * Shared open-lead handoff resolution (no cookie mutation).
 */
import { prisma } from "@/lib/prisma";
import { shouldConfirmWorkspaceSwitch } from "@/lib/open-lead-workspace-switch";

export type OpenLeadHandoffResolution =
  | { ok: false; reason: "not_found" | "forbidden" }
  | {
      ok: true;
      leadId: string;
      workspaceId: string;
      workspaceName: string;
      activeMemberWorkspaceIds: string[];
      cookieWorkspaceId: string | null;
      needsConfirm: boolean;
      /** Valid cookie already equals lead workspace — no write required. */
      cookieAlreadyCorrect: boolean;
    };

export async function resolveOpenLeadHandoff(input: {
  userId: string;
  leadId: string;
  cookieWorkspaceId: string | null;
}): Promise<OpenLeadHandoffResolution> {
  const lead = await prisma.lead.findUnique({
    where: { id: input.leadId },
    select: {
      id: true,
      workspaceId: true,
      workspace: { select: { id: true, name: true, status: true } },
    },
  });
  if (!lead?.workspaceId || lead.workspace?.status !== "ACTIVE") {
    return { ok: false, reason: "not_found" };
  }

  const activeMemberships = await prisma.workspaceMember.findMany({
    where: {
      userId: input.userId,
      status: "ACTIVE",
      workspace: { status: "ACTIVE" },
    },
    select: { workspaceId: true },
  });
  const activeMemberWorkspaceIds = activeMemberships.map((m) => m.workspaceId);
  if (!activeMemberWorkspaceIds.includes(lead.workspaceId)) {
    return { ok: false, reason: "not_found" };
  }

  const needsConfirm = shouldConfirmWorkspaceSwitch({
    leadWorkspaceId: lead.workspaceId,
    cookieWorkspaceId: input.cookieWorkspaceId,
    activeMemberWorkspaceIds,
  });

  const validCookie =
    input.cookieWorkspaceId &&
    activeMemberWorkspaceIds.includes(input.cookieWorkspaceId)
      ? input.cookieWorkspaceId
      : null;

  return {
    ok: true,
    leadId: lead.id,
    workspaceId: lead.workspaceId,
    workspaceName: lead.workspace.name,
    activeMemberWorkspaceIds,
    cookieWorkspaceId: input.cookieWorkspaceId,
    needsConfirm,
    cookieAlreadyCorrect: validCookie === lead.workspaceId,
  };
}
