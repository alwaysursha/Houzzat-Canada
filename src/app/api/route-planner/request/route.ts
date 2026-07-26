import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import { pickAssigneeAgentId } from "@/lib/agent";
import {
  AGENT_CONTACT_CONSENT_KIND,
  AGENT_CONTACT_CONSENT_VERSION,
} from "@/lib/consent";
import { sendNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import {
  enrichTourStops,
  getOrCreateActiveTour,
  serializeTour,
} from "@/lib/route-planner/server";

const schema = z.object({
  contactConsent: z.literal(true),
  notes: z.string().trim().max(2000).optional(),
});

function formatTime(iso: string | null | undefined) {
  if (!iso) return "TBD";
  return new Date(iso).toLocaleString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function POST(request: Request) {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues.some((i) => i.path[0] === "contactConsent")
          ? "Please agree to be contacted by a Houzzat agent."
          : "Invalid request.",
      },
      { status: 400 },
    );
  }

  const tour = await getOrCreateActiveTour(user.id);
  if (tour.stops.length === 0) {
    return NextResponse.json(
      { error: "Add homes to your Route Planner before requesting." },
      { status: 400 },
    );
  }

  const cards = await enrichTourStops(tour.stops.map((s) => s.mlsNumber));
  const itineraryLines = tour.stops.map((stop, index) => {
    const card = cards.get(stop.mlsNumber);
    const addr = card
      ? [
          card.unitNumber
            ? `${card.unitNumber} – ${card.addressLine}`
            : card.addressLine,
          card.city,
        ]
          .filter(Boolean)
          .join(", ")
      : stop.mlsNumber;
    return `${index + 1}. ${addr} (MLS® ${stop.mlsNumber}) · ${formatTime(
      stop.suggestedArriveAt?.toISOString(),
    )}–${formatTime(stop.suggestedLeaveAt?.toISOString())}`;
  });

  const itineraryText = [
    `Route Planner request from ${user.name ?? user.email}`,
    `Contact: ${user.name ?? "Customer"} <${user.email}>`,
    user.phone ? `Phone: ${user.phone}` : null,
    tour.startAddress
      ? `Start: ${tour.startAddress} at ${formatTime(tour.startAt?.toISOString())}`
      : "Start: not set",
    "",
    ...itineraryLines,
    parsed.data.notes ? `\nClient notes: ${parsed.data.notes}` : null,
    `Contact consent: yes (${AGENT_CONTACT_CONSENT_VERSION})`,
  ]
    .filter(Boolean)
    .join("\n");

  const assigneeId = await pickAssigneeAgentId();
  const assignee = assigneeId
    ? await prisma.user.findUnique({
        where: { id: assigneeId },
        select: { email: true, phone: true, name: true },
      })
    : null;

  const consentAt = new Date();
  const firstMls = tour.stops[0]!.mlsNumber;
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? null;
  const userAgent = request.headers.get("user-agent");

  const { leadId, shareToken } = await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: {
        source: "SHOWING_REQUEST",
        status: "SHOWING",
        score: 60,
        listingMls: firstMls,
        customerId: user.id,
        assignedAgentId: assigneeId,
        contactConsentAt: consentAt,
        notes: itineraryText,
        activities: {
          create: {
            type: "route_planner_request",
            userId: user.id,
            body: "Customer requested a multi-stop Route Planner itinerary.",
          },
        },
      },
    });

    await tx.consentEvent.create({
      data: {
        userId: user.id,
        leadId: lead.id,
        email: user.email.toLowerCase(),
        kind: AGENT_CONTACT_CONSENT_KIND,
        version: AGENT_CONTACT_CONSENT_VERSION,
        ip,
        userAgent,
      },
    });

    for (const stop of tour.stops) {
      await tx.appointment.create({
        data: {
          type: "SHOWING",
          status: "REQUESTED",
          listingMls: stop.mlsNumber,
          startsAt: stop.suggestedArriveAt,
          endsAt: stop.suggestedLeaveAt,
          notes: itineraryText,
          customerId: user.id,
          agentId: assigneeId,
          leadId: lead.id,
        },
      });
    }

    const token = tour.shareToken ?? randomBytes(12).toString("hex");
    await tx.viewingTour.update({
      where: { id: tour.id },
      data: {
        status: "REQUESTED",
        requestedAt: consentAt,
        shareToken: token,
      },
    });

    await tx.user.update({
      where: { id: user.id },
      data: { caslConsentAt: consentAt },
    });

    return { leadId: lead.id, shareToken: token };
  });

  if (assignee?.email) {
    void sendNotification({
      toEmail: assignee.email,
      toPhone: assignee.phone,
      subject: `Route Planner request · ${tour.stops.length} homes`,
      text: `${itineraryText}\n\nOpen agent desk: /agent/leads/${leadId}`,
      smsText: `Houzzat Route Planner: ${tour.stops.length} homes — check agent desk.`,
      whatsappText: `Route Planner request (${tour.stops.length} homes). /agent/leads/${leadId}`,
      preferWhatsApp: true,
    });
  }

  const refreshed = await getOrCreateActiveTour(user.id);
  const refreshedCards = await enrichTourStops(
    refreshed.stops.map((s) => s.mlsNumber),
  );

  return NextResponse.json({
    ok: true,
    leadId,
    shareToken,
    tour: serializeTour(refreshed, refreshedCards),
  });
}
