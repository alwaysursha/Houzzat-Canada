/**
 * Stage 4.9 — GET /api/mobile/v2/leads/[leadId]/engagement
 *
 * Web Lead Detail Engagement tab parity — observational read only.
 * Canonical data from loadLeadEngagement (same sources as loadLeadSummary).
 */

import { NextResponse } from "next/server";
import { authorizeMobileLeadAccess } from "@/lib/mobile/v2/lead-access";
import { loadLeadEngagement } from "@/lib/mobile/v2/load-lead-engagement";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ leadId: string }> },
) {
  try {
    const { leadId } = await context.params;
    const access = await authorizeMobileLeadAccess(request, leadId);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    const engagement = await loadLeadEngagement(access.lead.id);
    if (!engagement) {
      return NextResponse.json(
        { ok: false, code: "LEAD_NOT_FOUND", message: "Lead not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      ok: true,
      engagement,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
