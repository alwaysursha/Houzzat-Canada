import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAdCampaignId, utmLeadFields } from "@/lib/ads/attribution";
import { pickUtm } from "@/lib/ads/utm";
import { resolvePublicLeadDesk } from "@/lib/agent";
import {
  createCallNewLeadTask,
  resolveLeadDeskAssignment,
} from "@/lib/agent/lead-intake";
import { sendNotification } from "@/lib/notifications";
import { sendPushToUsers } from "@/lib/notifications/push";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  mlsNumber: z.string(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  message: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmContent: z.string().optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid inquiry" }, { status: 400 });
  }

  const listing = await prisma.listing.findFirst({
    where: {
      mlsNumber: parsed.data.mlsNumber,
      segment: "PRE_CONSTRUCTION",
      status: "ACTIVE",
    },
  });
  if (!listing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const desk = await resolvePublicLeadDesk();
  const routed = await resolveLeadDeskAssignment("BUYER");
  const organizationId = routed.organizationId ?? desk.organizationId;
  const assignedAgentId = routed.assigneeId;
  const deskNotifiers = organizationId
      ? await prisma.organizationMembership.findMany({
          where: {
            organizationId,
            role: { in: ["OWNER", "ADMIN"] },
            user: { disabledAt: null },
          },
          select: { user: { select: { id: true, email: true, phone: true } } },
        })
      : [];

  const utm = pickUtm(parsed.data);
  const adCampaignId = await resolveAdCampaignId(utm);

  const lead = await prisma.lead.create({
    data: {
      source: "PROPERTY_INQUIRY",
      status: "NEW_LEAD",
      intent: "BUYER",
      score: 45,
      listingMls: listing.mlsNumber,
      assignedAgentId,
      organizationId: organizationId ?? undefined,
      ...utmLeadFields(utm, adCampaignId),
      notes: [
        `Pre-construction inquiry: ${listing.addressLine}, ${listing.city}`,
        `Contact: ${parsed.data.name} <${parsed.data.email}>`,
        parsed.data.phone ? `Phone: ${parsed.data.phone}` : null,
        parsed.data.message ? `Message: ${parsed.data.message}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      activities: {
        create: {
          type: "precon_inquiry",
          body: parsed.data.message,
          meta: {
            email: parsed.data.email,
            phone: parsed.data.phone,
          },
        },
      },
    },
  });

  if (assignedAgentId && organizationId) {
    await createCallNewLeadTask({
      leadId: lead.id,
      assigneeId: assignedAgentId,
      organizationId,
    });
  }

  if (assignedAgentId && organizationId) {
    await createCallNewLeadTask({
      leadId: lead.id,
      assigneeId: assignedAgentId,
      organizationId,
    });
  }

  for (const row of deskNotifiers) {
    if (!row.user.email) continue;
    void sendNotification({
      toEmail: row.user.email,
      toPhone: row.user.phone,
      subject: "Pre-construction inquiry",
      text: `${listing.addressLine} — ${parsed.data.name} <${parsed.data.email}>`,
      smsText: `Houzzat pre-con lead: ${listing.addressLine}`,
    });
  }

  void sendPushToUsers(
    [assignedAgentId, ...deskNotifiers.map((row) => row.user.id)],
    {
      type: "new_lead",
      title: "Pre-construction inquiry",
      body: `${parsed.data.name} · ${listing.addressLine}`,
      href: `/agent/leads/${lead.id}`,
    },
  );

  return NextResponse.json({ ok: true, leadId: lead.id });
}
