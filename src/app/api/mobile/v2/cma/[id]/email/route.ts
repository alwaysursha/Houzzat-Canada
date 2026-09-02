/**
 * Stage 5.12A — POST /api/mobile/v2/cma/[id]/email
 */

import { NextResponse } from "next/server";
import {
  authorizeMobileCmaWorkspace,
  canAccessCmaInWorkspace,
  findWorkspaceCma,
} from "@/lib/cma/access";
import { sendCmaEmailToLead } from "@/lib/cma/send-cma-email";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const access = await authorizeMobileCmaWorkspace(request);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    const report = await findWorkspaceCma({
      id,
      workspaceId: access.workspaceId,
    });
    if (
      !report ||
      !canAccessCmaInWorkspace({
        role: access.role,
        cmaAgentId: report.agentId,
        userId: access.userId,
      })
    ) {
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", message: "CMA not found" },
        { status: 404 },
      );
    }

    const result = await sendCmaEmailToLead({
      cmaId: id,
      workspaceId: access.workspaceId,
      actorUserId: access.userId,
      role: access.role,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: result.code, message: result.message },
        { status: result.status },
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        emailed: true,
        emailLogId: result.emailLogId ?? null,
        stubbed: result.stubbed,
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
