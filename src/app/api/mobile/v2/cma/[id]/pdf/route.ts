/**
 * Stage 5.12B — GET /api/mobile/v2/cma/[id]/pdf
 *
 * Authenticated native agent PDF download.
 * No public PDF endpoint in this stage (email remains link-first).
 */

import { NextResponse } from "next/server";
import {
  authorizeMobileCmaWorkspace,
  canAccessCmaInWorkspace,
  findWorkspaceCma,
} from "@/lib/cma/access";
import { generateCmaPdfForReport } from "@/lib/cma/pdf";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
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

    // Never accept workspaceId from client body — tenant = report.workspaceId.
    const result = await generateCmaPdfForReport({
      reportId: report.id,
      workspaceId: access.workspaceId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: result.code, message: result.message },
        { status: result.status },
      );
    }

    const disposition = `attachment; filename="${result.filename.replace(/"/g, "")}"`;
    return new NextResponse(Buffer.from(result.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": disposition,
        "Cache-Control": "no-store",
        "X-Cma-Pdf-Via": result.via,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[cma-pdf] endpoint error", message);
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message: "Couldn't generate PDF" },
      { status: 500 },
    );
  }
}
