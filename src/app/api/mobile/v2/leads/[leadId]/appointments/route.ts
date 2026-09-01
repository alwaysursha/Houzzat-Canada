/**
 * Stage 4.7 — GET/POST /api/mobile/v2/leads/[leadId]/appointments
 *
 * Lead-scoped Appointment list + create.
 * List query matches web lead-summary: Lead.appointments by leadId after
 * authorizeMobileLeadAccess (same pattern as Stage 4.6.1 tasks).
 *
 * HTTP-mode safe: flat sequential writes only (no $transaction).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMobileLeadAccess } from "@/lib/mobile/v2/lead-access";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const APPOINTMENT_TYPES = [
  "SHOWING",
  "VIRTUAL_VIEWING",
  "BUYER_SESSION",
  "VALUATION_CALL",
] as const;

const createSchema = z.object({
  type: z.enum(APPOINTMENT_TYPES),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  videoJoinUrl: z.string().max(2000).optional().nullable(),
  listingMls: z.string().max(64).optional().nullable(),
});

function formatAppointment(a: {
  id: string;
  type: string;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  listingMls: string | null;
  notes: string | null;
  videoJoinUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: a.id,
    type: a.type,
    status: a.status,
    startsAt: a.startsAt ? a.startsAt.toISOString() : null,
    endsAt: a.endsAt ? a.endsAt.toISOString() : null,
    listingMls: a.listingMls,
    notes: a.notes,
    videoJoinUrl: a.videoJoinUrl,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
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

    // Canonical web: lead.appointments by leadId after lead authorization.
    const appointments = await prisma.appointment.findMany({
      where: { leadId: access.lead.id },
      orderBy: [{ createdAt: "desc" }],
      take: 30,
      select: {
        id: true,
        type: true,
        status: true,
        startsAt: true,
        endsAt: true,
        listingMls: true,
        notes: true,
        videoJoinUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      ok: true,
      appointments: appointments.map(formatAppointment),
    });
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
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "Invalid appointment payload",
        },
        { status: 400 },
      );
    }

    let startsAt: Date | null = null;
    if (parsed.data.startsAt) {
      startsAt = new Date(parsed.data.startsAt);
      if (Number.isNaN(startsAt.getTime())) {
        return NextResponse.json(
          { ok: false, code: "VALIDATION_ERROR", message: "Invalid startsAt" },
          { status: 400 },
        );
      }
    }

    let endsAt: Date | null = null;
    if (parsed.data.endsAt) {
      endsAt = new Date(parsed.data.endsAt);
      if (Number.isNaN(endsAt.getTime())) {
        return NextResponse.json(
          { ok: false, code: "VALIDATION_ERROR", message: "Invalid endsAt" },
          { status: 400 },
        );
      }
    }

    const lead = await prisma.lead.findUnique({
      where: { id: access.lead.id },
      select: { customerId: true, listingMls: true },
    });

    const appointment = await prisma.appointment.create({
      data: {
        type: parsed.data.type,
        status: "REQUESTED",
        leadId: access.lead.id,
        agentId: access.userId,
        customerId: lead?.customerId ?? null,
        listingMls:
          parsed.data.listingMls?.trim() ||
          lead?.listingMls ||
          access.lead.listingMls ||
          null,
        startsAt,
        endsAt,
        notes: parsed.data.notes?.trim() || null,
        videoJoinUrl:
          parsed.data.type === "VIRTUAL_VIEWING"
            ? parsed.data.videoJoinUrl?.trim() || null
            : null,
      },
      select: {
        id: true,
        type: true,
        status: true,
        startsAt: true,
        endsAt: true,
        listingMls: true,
        notes: true,
        videoJoinUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Web public/valuation creates do not add LeadActivity for appointment —
    // match that (no duplicate timeline inventing).

    return NextResponse.json({
      ok: true,
      appointment: formatAppointment(appointment),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
