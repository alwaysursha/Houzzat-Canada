import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAdCampaignId, utmLeadFields } from "@/lib/ads/attribution";
import { pickUtm } from "@/lib/ads/utm";
import { pickAssigneeAgentId } from "@/lib/agent";
import { sendNotification } from "@/lib/notifications";
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

  const assigneeId = await pickAssigneeAgentId();
  const assignee = assigneeId
    ? await prisma.user.findUnique({
        where: { id: assigneeId },
        select: { email: true, phone: true },
      })
    : null;

  const utm = pickUtm(parsed.data);
  const adCampaignId = await resolveAdCampaignId(utm);

  const lead = await prisma.lead.create({
    data: {
      source: "PROPERTY_INQUIRY",
      status: "NEW",
      score: 45,
      listingMls: listing.mlsNumber,
      assignedAgentId: assigneeId,
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

  if (assignee?.email) {
    void sendNotification({
      toEmail: assignee.email,
      toPhone: assignee.phone,
      subject: "Pre-construction inquiry",
      text: `${listing.addressLine} — ${parsed.data.name} <${parsed.data.email}>`,
      smsText: `Houzzat pre-con lead: ${listing.addressLine}`,
    });
  }

  return NextResponse.json({ ok: true, leadId: lead.id });
}
