import { NextResponse } from "next/server";
import { z } from "zod";
import type { AppointmentStatus } from "@prisma/client";
import { requireAgentContextFromRequest } from "@/lib/agent";
import { canMutateAppointment } from "@/lib/crm-read-scope";
import { sendAppointmentCustomerEmail } from "@/lib/email/appointment-customer-email";
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

  const customerEmail = appointment.customer?.email?.trim() || null;
  const workspaceId = appointment.lead?.workspaceId ?? null;
  if (
    customerEmail &&
    workspaceId &&
    (parsed.data.status === "CONFIRMED" ||
      parsed.data.status === "RESCHEDULED" ||
      parsed.data.status === "CANCELLED")
  ) {
    void sendAppointmentCustomerEmail({
      workspaceId,
      toEmail: customerEmail,
      toPhone: appointment.customer?.phone,
      recipientName: appointment.customer?.name,
      type: updated.type,
      status: parsed.data.status,
      startsAt: updated.startsAt,
      endsAt: updated.endsAt,
      listingMls: updated.listingMls,
      videoJoinUrl: updated.videoJoinUrl,
      agentId: updated.agentId,
      leadId: updated.leadId,
      customerId: appointment.customer?.id,
    }).catch((error) => {
      console.error("[appointments] customer email failed", error);
    });
  }
  if (parsed.data.status === "CONFIRMED" && appointment.customer) {
    const label =
      updated.type === "VIRTUAL_VIEWING" ? "Virtual viewing" : "Showing";
    void sendPushToUser(appointment.customer.id, {
      type: "viewing_reminder",
      title: `${label} confirmed`,
      body: updated.listingMls
        ? `MLS® ${updated.listingMls}`
        : "Your appointment is confirmed",
      href: "/account",
    });
  }

  return NextResponse.json({ ok: true, appointment: updated });
}
