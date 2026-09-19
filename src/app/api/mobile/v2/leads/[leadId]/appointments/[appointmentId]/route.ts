/**
 * Stage 4.7 — PATCH /api/mobile/v2/leads/[leadId]/appointments/[appointmentId]
 *
 * Confirm / complete / cancel (+ optional startsAt / notes / videoJoinUrl)
 * matching PATCH /api/agent/appointments + AppointmentActions.
 *
 * HTTP-mode safe: single flat update (no $transaction).
 * Confirm notification side effects match web when status → CONFIRMED.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import type { AppointmentStatus } from "@prisma/client";
import { authorizeMobileLeadAccess } from "@/lib/mobile/v2/lead-access";
import { sendNotification } from "@/lib/notifications";
import { sendPushToUser } from "@/lib/notifications/push";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    status: z
      .enum(["REQUESTED", "CONFIRMED", "RESCHEDULED", "COMPLETED", "CANCELLED"])
      .optional(),
    startsAt: z.string().datetime().optional().nullable(),
    endsAt: z.string().datetime().optional().nullable(),
    videoJoinUrl: z.string().max(2000).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .refine(
    (v) =>
      v.status !== undefined ||
      v.startsAt !== undefined ||
      v.endsAt !== undefined ||
      v.videoJoinUrl !== undefined ||
      v.notes !== undefined,
    { message: "Provide at least one mutable field" },
  );

export async function PATCH(
  request: Request,
  context: { params: Promise<{ leadId: string; appointmentId: string }> },
) {
  try {
    const { leadId, appointmentId } = await context.params;
    const access = await authorizeMobileLeadAccess(request, leadId);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }

    if (!appointmentId) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Missing appointmentId" },
        { status: 400 },
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

    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "Invalid appointment patch payload",
        },
        { status: 400 },
      );
    }

    const existing = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        type: true,
        status: true,
        leadId: true,
        agentId: true,
        listingMls: true,
        customer: {
          select: { id: true, email: true, phone: true, name: true },
        },
      },
    });

    if (!existing || existing.leadId !== access.lead.id) {
      return NextResponse.json(
        {
          ok: false,
          code: "APPOINTMENT_NOT_FOUND",
          message: "Appointment not found for this lead",
        },
        { status: 404 },
      );
    }

    // Mirror web canMutateAppointment: only assignee (or unset agentId) may mutate.
    if (existing.agentId && existing.agentId !== access.userId) {
      return NextResponse.json(
        {
          ok: false,
          code: "WORKSPACE_FORBIDDEN",
          message: "Not permitted to mutate this appointment",
        },
        { status: 403 },
      );
    }

    let startsAt: Date | null | undefined;
    if (parsed.data.startsAt === null) startsAt = null;
    else if (parsed.data.startsAt !== undefined) {
      startsAt = new Date(parsed.data.startsAt);
      if (Number.isNaN(startsAt.getTime())) {
        return NextResponse.json(
          { ok: false, code: "VALIDATION_ERROR", message: "Invalid startsAt" },
          { status: 400 },
        );
      }
    }

    let endsAt: Date | null | undefined;
    if (parsed.data.endsAt === null) endsAt = null;
    else if (parsed.data.endsAt !== undefined) {
      endsAt = new Date(parsed.data.endsAt);
      if (Number.isNaN(endsAt.getTime())) {
        return NextResponse.json(
          { ok: false, code: "VALIDATION_ERROR", message: "Invalid endsAt" },
          { status: 400 },
        );
      }
    }

    const nextStatus = parsed.data.status as AppointmentStatus | undefined;

    const updated = await prisma.appointment.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        startsAt,
        endsAt,
        videoJoinUrl:
          parsed.data.videoJoinUrl === ""
            ? null
            : parsed.data.videoJoinUrl === undefined
              ? undefined
              : parsed.data.videoJoinUrl,
        notes:
          parsed.data.notes === undefined
            ? undefined
            : parsed.data.notes?.trim() || null,
        agentId: existing.agentId ?? access.userId,
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

    // Canonical web side effect on Confirm (email/SMS/push) — keep correctness.
    if (nextStatus === "CONFIRMED" && existing.customer?.email) {
      const label =
        existing.type === "VIRTUAL_VIEWING" ? "Virtual Viewing" : "Showing";
      void sendNotification({
        toEmail: existing.customer.email,
        toPhone: existing.customer.phone,
        subject: `Your ${label} is confirmed`,
        text: [
          `Hi ${existing.customer.name ?? "there"},`,
          `Your ${label} for ${existing.listingMls ?? "a property"} is confirmed.`,
          updated.startsAt
            ? `When: ${updated.startsAt.toLocaleString("en-CA")}`
            : null,
          updated.videoJoinUrl
            ? `Join link: ${updated.videoJoinUrl}`
            : existing.type === "VIRTUAL_VIEWING"
              ? "Your agent will share the video link shortly."
              : null,
        ]
          .filter(Boolean)
          .join("\n"),
        smsText: `Houzzat: ${label} confirmed${updated.startsAt ? ` ${updated.startsAt.toLocaleString("en-CA")}` : ""}.`,
        workspaceId: access.workspaceId,
        smsClass: "transactional",
      });
      void sendPushToUser(existing.customer.id, {
        type: "viewing_reminder",
        title: `${label} confirmed`,
        body: existing.listingMls
          ? `MLS® ${existing.listingMls}`
          : "Your appointment is confirmed",
        href: "/account",
      });
    }

    return NextResponse.json({
      ok: true,
      appointment: {
        id: updated.id,
        type: updated.type,
        status: updated.status,
        startsAt: updated.startsAt ? updated.startsAt.toISOString() : null,
        endsAt: updated.endsAt ? updated.endsAt.toISOString() : null,
        listingMls: updated.listingMls,
        notes: updated.notes,
        videoJoinUrl: updated.videoJoinUrl,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
