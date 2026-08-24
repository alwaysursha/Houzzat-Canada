import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAdCampaignId, utmLeadFields } from "@/lib/ads/attribution";
import { pickUtm } from "@/lib/ads/utm";
import { resolvePublicLeadDesk } from "@/lib/agent";
import {
  createCallNewLeadTask,
  resolveLeadDeskAssignment,
} from "@/lib/agent/lead-intake";
import { resolveLeadCrmOwnership } from "@/lib/crm-ownership";
import {
  notifyNewLeadCapturedToStaff,
  scheduleNewLeadStaffEmail,
} from "@/lib/notifications/staff-events";
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
  const ownership = await resolveLeadCrmOwnership(organizationId);

  const lead = await prisma.lead.create({
    data: {
      source: "PROPERTY_INQUIRY",
      status: "NEW_LEAD",
      intent: "BUYER",
      score: 45,
      listingMls: listing.mlsNumber,
      assignedAgentId,
      organizationId: ownership.organizationId ?? organizationId ?? undefined,
      workspaceId: ownership.workspaceId,
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

  const deskUserIds = deskNotifiers.map((row) => row.user.id);

  notifyNewLeadCapturedToStaff({
    leadId: lead.id,
    label: `${parsed.data.name} · ${listing.addressLine}`,
    title: "Pre-construction inquiry",
    assigneeId: assignedAgentId,
    deskUserIds,
  });

  scheduleNewLeadStaffEmail({
    leadId: lead.id,
    source: "pre_construction",
    subject: "New pre-construction lead",
    detailLines: [
      `Listing: ${listing.addressLine}`,
      `Contact: ${parsed.data.name}`,
      `Email: ${parsed.data.email}`,
      parsed.data.phone ? `Phone: ${parsed.data.phone}` : null,
    ].filter((line): line is string => Boolean(line)),
    assigneeId: assignedAgentId,
    deskRecipients: deskNotifiers.map((row) => ({
      id: row.user.id,
      email: row.user.email,
      phone: row.user.phone,
    })),
    smsText: `Houzzat pre-con lead: ${listing.addressLine}`,
  });

  if (assignedAgentId && organizationId) {
    try {
      await createCallNewLeadTask({
        leadId: lead.id,
        assigneeId: assignedAgentId,
        organizationId,
      });
    } catch (err) {
      console.error("[pre-construction] call-new-lead-task failed", {
        leadId: lead.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ok: true, leadId: lead.id });
}
