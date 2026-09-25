/**
 * Stage 5.6 — GET/POST/PATCH /api/mobile/v2/leads/[leadId]/viewings-planner
 *
 * HTTP-mode safe: flat sequential Prisma writes only (no $transaction,
 * no nested relation creates, no updateMany). PrismaNeonHttp rejects internal txns.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMobileLeadAccess } from "@/lib/mobile/v2/lead-access";
import {
  buildProTourResponse,
  getOrCreateProDraftTour,
  removeProTourStops,
  reorderProTourStops,
  updateProStopTimes,
  updateProTourFields,
} from "@/lib/mobile/v2/viewings-planner";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const postSchema = z.object({
  mlsNumbers: z.array(z.string().min(3).max(64)).max(10).default([]),
});

const patchSchema = z.object({
  tourId: z.string().min(1),
  startAddress: z.string().trim().max(240).nullable().optional(),
  startLat: z.number().min(-90).max(90).nullable().optional(),
  startLng: z.number().min(-180).max(180).nullable().optional(),
  startAt: z.string().datetime().nullable().optional(),
  viewingDate: z.string().datetime().nullable().optional(),
  stopOrder: z.array(z.string().min(1)).optional(),
  stopTimes: z
    .array(
      z.object({
        stopId: z.string().min(1),
        startsAt: z.string().datetime().nullable(),
        endsAt: z.string().datetime().nullable(),
      }),
    )
    .optional(),
  removeStopIds: z.array(z.string().min(1)).max(10).optional(),
});

async function loadLeadCustomer(leadId: string) {
  return prisma.lead.findUnique({
    where: { id: leadId },
    select: { customerId: true },
  });
}

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

    const tour = await prisma.viewingTour.findFirst({
      where: {
        leadId: access.lead.id,
        workspaceId: access.workspaceId,
        isActive: true,
        status: "DRAFT",
      },
      orderBy: { updatedAt: "desc" },
    });

    if (!tour) {
      return NextResponse.json({ ok: true, tour: null });
    }

    const payload = await buildProTourResponse(tour.id);
    return NextResponse.json({ ok: true, tour: payload });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}

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
      json = {};
    }
    const parsed = postSchema.safeParse(json ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid payload" },
        { status: 400 },
      );
    }

    const lead = await loadLeadCustomer(access.lead.id);
    const hadDraft = await prisma.viewingTour.findFirst({
      where: {
        leadId: access.lead.id,
        workspaceId: access.workspaceId,
        isActive: true,
        status: "DRAFT",
      },
    });

    const tour = await getOrCreateProDraftTour({
      leadId: access.lead.id,
      workspaceId: access.workspaceId,
      agentId: access.userId,
      customerId: lead?.customerId ?? null,
      mlsNumbers: parsed.data.mlsNumbers,
    });

    const payload = await buildProTourResponse(tour.id);
    return NextResponse.json({
      ok: true,
      tour: payload,
      isUpdate: Boolean(hadDraft),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}

export async function PATCH(
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

    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid payload" },
        { status: 400 },
      );
    }

    const existing = await prisma.viewingTour.findFirst({
      where: {
        id: parsed.data.tourId,
        leadId: access.lead.id,
        workspaceId: access.workspaceId,
      },
    });
    if (!existing) {
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", message: "Viewing plan not found" },
        { status: 404 },
      );
    }

    if (parsed.data.stopOrder?.length) {
      await reorderProTourStops(parsed.data.tourId, parsed.data.stopOrder);
    }

    if (parsed.data.stopTimes?.length) {
      await updateProStopTimes(parsed.data.tourId, parsed.data.stopTimes);
    }

    if (parsed.data.removeStopIds?.length) {
      await removeProTourStops(parsed.data.tourId, parsed.data.removeStopIds);
    }

    await updateProTourFields(parsed.data.tourId, {
      startAddress: parsed.data.startAddress,
      startLat: parsed.data.startLat,
      startLng: parsed.data.startLng,
      startAt: parsed.data.startAt ? new Date(parsed.data.startAt) : parsed.data.startAt === null ? null : undefined,
      viewingDate: parsed.data.viewingDate
        ? new Date(parsed.data.viewingDate)
        : parsed.data.viewingDate === null
          ? null
          : undefined,
    });

    const payload = await buildProTourResponse(parsed.data.tourId);
    return NextResponse.json({ ok: true, tour: payload });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message === "INVALID_STOP_ORDER" ? 400 : 500;
    return NextResponse.json(
      { ok: false, code: message, message },
      { status },
    );
  }
}
