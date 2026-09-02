/**
 * Stage 5.13 — POST /api/mobile/v2/team/primary-agent
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMobileWorkspaceAccess } from "@/lib/mobile/v2/workspace-access";
import {
  buildMobileTeamContext,
  loadMobileTeamPayload,
} from "@/lib/mobile/v2/team";
import { setWorkspacePrimaryAgent } from "@/lib/workspace-team-admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  userId: z.string().trim().min(1).max(128),
});

export async function POST(request: Request) {
  try {
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
        { ok: false, code: "VALIDATION_ERROR", message: "userId required" },
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

    const result = await setWorkspacePrimaryAgent(ctx, parsed.data.userId);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: "TEAM_ERROR", message: result.error },
        { status: result.status ?? 400 },
      );
    }

    const data = await loadMobileTeamPayload(ctx);
    return NextResponse.json({
      ok: true,
      data: { primaryAgentId: result.primaryAgentId, team: data },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
