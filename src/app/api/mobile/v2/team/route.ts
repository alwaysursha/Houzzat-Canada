/**
 * Stage 5.13 — GET /api/mobile/v2/team
 */

import { NextResponse } from "next/server";
import { authorizeMobileWorkspaceAccess } from "@/lib/mobile/v2/workspace-access";
import {
  buildMobileTeamContext,
  loadMobileTeamPayload,
} from "@/lib/mobile/v2/team";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
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

    const data = await loadMobileTeamPayload(ctx);
    if (!data) {
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", message: "Workspace not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
