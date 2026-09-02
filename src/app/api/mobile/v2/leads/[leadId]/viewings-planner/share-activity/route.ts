/**
 * Stage 5.6 — POST share-activity logging for Viewings Planner.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMobileLeadAccess } from "@/lib/mobile/v2/lead-access";
import { logViewingShareActivity } from "@/lib/mobile/v2/viewings-planner";

export const runtime = "nodejs";

const schema = z.object({
  channel: z.enum(["email", "whatsapp", "sms", "copy_link", "native_share"]),
});

export async function POST(
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

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid JSON" },
        { status: 400 },
      );
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid channel" },
        { status: 400 },
      );
    }

    await logViewingShareActivity({
      leadId: access.lead.id,
      agentId: access.userId,
      channel: parsed.data.channel,
    });

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
