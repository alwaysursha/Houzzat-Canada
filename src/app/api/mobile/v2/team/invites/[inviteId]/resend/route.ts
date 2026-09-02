/**
 * Stage 5.13 — POST /api/mobile/v2/team/invites/[inviteId]/resend
 */

import { NextResponse } from "next/server";
import { authorizeMobileWorkspaceAccess } from "@/lib/mobile/v2/workspace-access";
import {
  buildMobileTeamContext,
  loadMobileTeamPayload,
} from "@/lib/mobile/v2/team";
import { resendWorkspaceInvite } from "@/lib/workspace-invite";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ inviteId: string }> };

export async function POST(request: Request, routeCtx: Ctx) {
  try {
    const { inviteId } = await routeCtx.params;
    const access = await authorizeMobileWorkspaceAccess(request);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    const ctx = await buildMobileTeamContext({
      userId: access.userId,
      workspaceId: access.workspaceId,
      role: access.role,
    });
    if (!ctx) {
      return NextResponse.json(
        { ok: false, code: "FORBIDDEN", message: "Team context unavailable" },
        { status: 403 },
      );
    }

    const result = await resendWorkspaceInvite(ctx, inviteId);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: "TEAM_ERROR", message: result.error },
        { status: result.status ?? 400 },
      );
    }

    const data = await loadMobileTeamPayload(ctx);
    return NextResponse.json({ ok: true, data: { team: data } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
