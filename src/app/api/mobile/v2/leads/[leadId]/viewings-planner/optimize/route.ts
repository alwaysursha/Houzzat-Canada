/**
 * Stage 5.6 — POST /api/mobile/v2/leads/[leadId]/viewings-planner/optimize
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMobileLeadAccess } from "@/lib/mobile/v2/lead-access";
import {
  buildProTourResponse,
  optimizeProTour,
} from "@/lib/mobile/v2/viewings-planner";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const schema = z.object({
  tourId: z.string().min(1),
  reorder: z.boolean().default(true),
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

    let json: unknown = {};
    try {
      json = await request.json();
    } catch {
      json = {};
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

    try {
      await optimizeProTour({
        tourId: parsed.data.tourId,
        reorder: parsed.data.reorder,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Optimize failed";
      if (message === "START_LOCATION_REQUIRED") {
        return NextResponse.json(
          {
            ok: false,
            code: "START_LOCATION_REQUIRED",
            message: "Set a starting location before calculating the route.",
          },
          { status: 400 },
        );
      }
      if (message.startsWith("MISSING_COORDS:")) {
        return NextResponse.json(
          {
            ok: false,
            code: "MISSING_COORDS",
            message: "A selected property is missing map coordinates.",
          },
          { status: 400 },
        );
      }
      throw error;
    }

    const payload = await buildProTourResponse(parsed.data.tourId);
    return NextResponse.json({ ok: true, tour: payload });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
