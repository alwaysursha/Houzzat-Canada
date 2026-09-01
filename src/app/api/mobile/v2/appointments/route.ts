/**
 * Stage 5.1 — GET /api/mobile/v2/appointments
 *
 * Global Agent Appointments (web /agent/appointments).
 * Same Appointment records as Stage 4.7 — bounded date range, tenant via Lead.
 *
 * HTTP-mode safe: read-only (no $transaction).
 */

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import {
  mobileAppointmentRangeWhere,
  mobileAppointmentVisibilityWhere,
  mobileTenantLeadIds,
  parseMobileAppointmentRange,
} from "@/lib/mobile/v2/appointment-scope";
import { authorizeMobileWorkspaceAccess } from "@/lib/mobile/v2/workspace-access";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const PAGE_SIZE = 100;

function formatGlobalAppointment(a: {
  id: string;
  type: string;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  listingMls: string | null;
  notes: string | null;
  videoJoinUrl: string | null;
  leadId: string | null;
  createdAt: Date;
  updatedAt: Date;
  customer: {
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  lead: {
    id: string;
    customer: { name: string | null; email: string | null } | null;
  } | null;
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
    leadId: a.leadId,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    customer: a.customer
      ? {
          name: a.customer.name,
          email: a.customer.email,
          phone: a.customer.phone,
        }
      : null,
    lead: a.lead
      ? {
          id: a.lead.id,
          customer: {
            name: a.lead.customer?.name ?? null,
            email: a.lead.customer?.email ?? null,
          },
        }
      : null,
  };
}

export async function GET(request: Request) {
  try {
    const access = await authorizeMobileWorkspaceAccess(request);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    const url = new URL(request.url);
    const rangeResult = parseMobileAppointmentRange(
      url.searchParams.get("from"),
      url.searchParams.get("to"),
    );
    if (!rangeResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: rangeResult.message,
        },
        { status: 400 },
      );
    }

    const typeParam = url.searchParams.get("type")?.trim();
    const canSeeTeamLeads =
      access.role === "OWNER" || access.role === "ADMIN";

    const tenantLeadIds = await mobileTenantLeadIds(
      access.workspaceId,
      access.userId,
      access.role,
    );

    const and: Prisma.AppointmentWhereInput[] = [
      mobileAppointmentVisibilityWhere(
        tenantLeadIds,
        access.userId,
        canSeeTeamLeads,
      ),
      mobileAppointmentRangeWhere(rangeResult.range),
    ];

    if (typeParam === "VIRTUAL_VIEWING") {
      and.push({ type: "VIRTUAL_VIEWING" });
    }

    const appointments = await prisma.appointment.findMany({
      where: { AND: and },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: PAGE_SIZE,
      select: {
        id: true,
        type: true,
        status: true,
        startsAt: true,
        endsAt: true,
        listingMls: true,
        notes: true,
        videoJoinUrl: true,
        leadId: true,
        createdAt: true,
        updatedAt: true,
        customer: {
          select: { name: true, email: true, phone: true },
        },
        lead: {
          select: {
            id: true,
            customer: { select: { name: true, email: true } },
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      from: rangeResult.range.from.toISOString(),
      to: rangeResult.range.to.toISOString(),
      appointments: appointments.map(formatGlobalAppointment),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
