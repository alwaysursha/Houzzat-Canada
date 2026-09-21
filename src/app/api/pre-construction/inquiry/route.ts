import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAdCampaignId, utmLeadFields } from "@/lib/ads/attribution";
import { pickUtm } from "@/lib/ads/utm";
import {
  publicLeadNotificationCopy,
  publicLeadRoutingErrorResponse,
  publicResolveOrCreateLead,
} from "@/lib/agent/public-lead-api";
import { createCallNewLeadTask } from "@/lib/agent/lead-intake";
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
  try {
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

    const utm = pickUtm(parsed.data);
    const adCampaignId = await resolveAdCampaignId(utm);
    const resolved = await publicResolveOrCreateLead({
      request,
      intent: "BUYER",
      isBuyer: true,
      isSeller: false,
      source: "PROPERTY_INQUIRY",
      email: parsed.data.email,
      phone: parsed.data.phone,
      name: parsed.data.name,
      score: 45,
      listingMls: listing.mlsNumber,
      utm: utmLeadFields(utm, adCampaignId),
      notes: [
        `Pre-construction inquiry: ${listing.addressLine}, ${listing.city}`,
        `Contact: ${parsed.data.name} <${parsed.data.email}>`,
        parsed.data.phone ? `Phone: ${parsed.data.phone}` : null,
        parsed.data.message ? `Message: ${parsed.data.message}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      activity: {
        type: "precon_inquiry",
        body: parsed.data.message,
        meta: {
          email: parsed.data.email,
          phone: parsed.data.phone,
        },
      },
    });

    const {
      lead,
      assignedAgentId,
      organizationId,
      created,
      brand,
      deskNotifiers,
    } = resolved;
    const notify = publicLeadNotificationCopy(brand, "pre-construction");

    if (created) {
      const deskUserIds = deskNotifiers.map((row) => row.user.id);

      notifyNewLeadCapturedToStaff({
        leadId: lead.id,
        label: `${parsed.data.name} · ${listing.addressLine}`,
        title: notify.pushTitle,
        assigneeId: assignedAgentId,
        deskUserIds,
      });

      scheduleNewLeadStaffEmail({
        leadId: lead.id,
        source: "pre_construction",
        subject: notify.emailSubject,
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
        smsText: `${notify.smsPrefix}: ${listing.addressLine}`,
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
    }

    return NextResponse.json({ ok: true, leadId: lead.id });
  } catch (error) {
    const routingError = publicLeadRoutingErrorResponse(error);
    if (routingError) return routingError;
    throw error;
  }
}
