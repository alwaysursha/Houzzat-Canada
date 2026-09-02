/**
 * Stage 5.6 — POST /api/mobile/v2/leads/[leadId]/viewings-planner/save
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMobileLeadAccess } from "@/lib/mobile/v2/lead-access";
import { saveProViewingsPlan } from "@/lib/mobile/v2/viewings-planner";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const schema = z.object({
  tourId: z.string().min(1),
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
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid payload" },
        { status: 400 },
      );
    }

    const tour = await prisma.viewingTour.findFirst({
      where: {
        id: parsed.data.tourId,
        leadId: access.lead.id,
        workspaceId: access.workspaceId,
      },
    });
    if (!tour) {
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", message: "Viewing plan not found" },
        { status: 404 },
      );
    }

    const lead = await prisma.lead.findUnique({
      where: { id: access.lead.id },
      select: { customerId: true },
    });

    const payload = await saveProViewingsPlan({
      tourId: parsed.data.tourId,
      leadId: access.lead.id,
      workspaceId: access.workspaceId,
      agentId: access.userId,
      customerId: lead?.customerId ?? null,
      isUpdate: Boolean(tour.shareToken),
    });

    return NextResponse.json({ ok: true, tour: payload });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
