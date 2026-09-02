/**
 * Stage 5.13 — GET/PATCH /api/mobile/v2/team/[membershipId]
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import type { WorkspaceMemberRole } from "@prisma/client";
import { authorizeMobileWorkspaceAccess } from "@/lib/mobile/v2/workspace-access";
import {
  buildMobileTeamContext,
  loadMobileTeamMemberDetail,
  loadMobileTeamPayload,
} from "@/lib/mobile/v2/team";
import {
  changeWorkspaceMemberRole,
  reactivateWorkspaceMember,
  suspendWorkspaceMember,
} from "@/lib/workspace-team-admin";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ membershipId: string }> };

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("change_role"),
    role: z.enum(["ADMIN", "AGENT"]),
  }),
  z.object({ action: z.literal("suspend") }),
  z.object({ action: z.literal("reactivate") }),
]);

export async function GET(request: Request, routeCtx: Ctx) {
  try {
    const { membershipId } = await routeCtx.params;
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

    const member = await loadMobileTeamMemberDetail(ctx, membershipId);
    if (!member) {
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", message: "Member not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, data: { member } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, routeCtx: Ctx) {
  try {
    const { membershipId } = await routeCtx.params;
    const access = await authorizeMobileWorkspaceAccess(request);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    const body = patchSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid body" },
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

    let result:
      | { ok: true }
      | { ok: false; error: string; status?: number };

    switch (body.data.action) {
      case "change_role":
        result = await changeWorkspaceMemberRole(
          ctx,
          membershipId,
          body.data.role as WorkspaceMemberRole,
        );
        break;
      case "suspend":
        result = await suspendWorkspaceMember(ctx, membershipId);
        break;
      case "reactivate":
        result = await reactivateWorkspaceMember(ctx, membershipId);
        break;
      default: {
        const _exhaustive: never = body.data;
        return _exhaustive;
      }
    }

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: "TEAM_ERROR", message: result.error },
        { status: result.status ?? 400 },
      );
    }

    const data = await loadMobileTeamPayload(ctx);
    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
