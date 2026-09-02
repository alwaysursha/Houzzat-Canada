/**
 * Stage 5.13 — POST /api/mobile/v2/team/[membershipId]/remove
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMobileWorkspaceAccess } from "@/lib/mobile/v2/workspace-access";
import {
  buildMobileTeamContext,
  loadMobileTeamPayload,
} from "@/lib/mobile/v2/team";
import { removeWorkspaceMember } from "@/lib/workspace-team-admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ membershipId: string }> };

const bodySchema = z.object({
  transferToUserId: z.string().trim().min(1).max(128),
});

export async function POST(request: Request, routeCtx: Ctx) {
  try {
    const { membershipId } = await routeCtx.params;
    const access = await authorizeMobileWorkspaceAccess(request);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "transferToUserId is required",
        },
        { status: 400 },
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

    const result = await removeWorkspaceMember({
      ctx,
      membershipId,
      transferToUserId: parsed.data.transferToUserId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: "TEAM_ERROR", message: result.error },
        { status: result.status ?? 400 },
      );
    }

    const data = await loadMobileTeamPayload(ctx);
    return NextResponse.json({
      ok: true,
      data: {
        transferred: result.transferred,
        team: data,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
