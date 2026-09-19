import { NextResponse } from "next/server";
import { z } from "zod";
import type { AppointmentStatus } from "@prisma/client";
import { requireAgentContextFromRequest } from "@/lib/agent";
import { canMutateAppointment } from "@/lib/crm-read-scope";
import { sendNotification } from "@/lib/notifications";
import { sendPushToUser } from "@/lib/notifications/push";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  appointmentId: z.string().min(1),
  status: z
    .enum(["REQUESTED", "CONFIRMED", "RESCHEDULED", "COMPLETED", "CANCELLED"])
    .optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  videoJoinUrl: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

const leadAuthSelect = {
  organizationId: true,
  workspaceId: true,
  assignedAgentId: true,
} as const;

export async function PATCH(request: Request) {
  const ctx = await requireAgentContextFromRequest(request);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: parsed.data.appointmentId },
    select: {
      id: true,
      type: true,
      agentId: true,
      listingMls: true,
      customer: { select: { id: true, email: true, phone: true, name: true } },
      lead: { select: leadAuthSelect },
    },
  });

  if (!appointment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const auth = canMutateAppointment(ctx, appointment);
  if (!auth.allowed) {
    if (auth.reason === "lead") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      status: parsed.data.status as AppointmentStatus | undefined,
      startsAt: parsed.data.startsAt
        ? new Date(parsed.data.startsAt)
        : undefined,
      endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : undefined,
      videoJoinUrl:
        parsed.data.videoJoinUrl === ""
          ? null
          : parsed.data.videoJoinUrl,
      notes: parsed.data.notes,
      agentId: appointment.agentId ?? ctx.user.id,
    },
  });

  if (
    parsed.data.status === "CONFIRMED" &&
    appointment.customer?.email
  ) {
    const label =
      appointment.type === "VIRTUAL_VIEWING"
        ? "Virtual Viewing"
        : "Showing";
    void sendNotification({
      toEmail: appointment.customer.email,
      toPhone: appointment.customer.phone,
      subject: `Your ${label} is confirmed`,
      text: [
        `Hi ${appointment.customer.name ?? "there"},`,
        `Your ${label} for ${appointment.listingMls ?? "a property"} is confirmed.`,
        updated.startsAt
          ? `When: ${updated.startsAt.toLocaleString("en-CA")}`
          : null,
        updated.videoJoinUrl
          ? `Join link: ${updated.videoJoinUrl}`
          : appointment.type === "VIRTUAL_VIEWING"
            ? "Your agent will share the video link shortly."
            : null,
      ]
        .filter(Boolean)
        .join("\n"),
      smsText: `Houzzat: ${label} confirmed${updated.startsAt ? ` ${updated.startsAt.toLocaleString("en-CA")}` : ""}.`,
      workspaceId: appointment.lead?.workspaceId ?? null,
      smsClass: "transactional",
    });
    void sendPushToUser(appointment.customer.id, {
      type: "viewing_reminder",
      title: `${label} confirmed`,
      body: appointment.listingMls
        ? `MLS® ${appointment.listingMls}`
        : "Your appointment is confirmed",
      href: "/account",
    });
  }

  return NextResponse.json({ ok: true, appointment: updated });
}
