/**
 * Mobile v2 Chat — AgentOrgContext from workspace JWT.
 * Reuses buildMobileTeamContext (same desk resolution as Team/Statistics).
 * Does not create Conversation/Message models; callers use existing chat services.
 */

import type { AgentOrgContext } from "@/lib/agent";
import { buildMobileTeamContext } from "@/lib/mobile/v2/team";
import {
  authorizeMobileWorkspaceAccess,
  type MobileWorkspaceAccessErr,
} from "@/lib/mobile/v2/workspace-access";

export type MobileChatContextOk = {
  ok: true;
  ctx: AgentOrgContext;
  userId: string;
  workspaceId: string;
};

export type MobileChatContextErr = MobileWorkspaceAccessErr | {
  ok: false;
  status: number;
  code: string;
  message: string;
};

export async function authorizeMobileChatContext(
  request: Request,
): Promise<MobileChatContextOk | MobileChatContextErr> {
  const access = await authorizeMobileWorkspaceAccess(request);
  if (!access.ok) return access;

  const ctx = await buildMobileTeamContext({
    userId: access.userId,
    workspaceId: access.workspaceId,
    role: access.role,
  });
  if (!ctx || !ctx.workspaceId) {
    return {
      ok: false,
      status: 403,
      code: "FORBIDDEN",
      message: "Chat context unavailable",
    };
  }

  return {
    ok: true,
    ctx,
    userId: access.userId,
    workspaceId: access.workspaceId,
  };
}
