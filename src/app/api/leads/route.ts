import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { resolveAdCampaignId, utmLeadFields } from "@/lib/ads/attribution";
import { pickUtm } from "@/lib/ads/utm";
import { resolvePublicLeadDesk } from "@/lib/agent";
import {
  createCallNewLeadTask,
  resolveLeadDeskAssignment,
  resolveLeadIntent,
} from "@/lib/agent/lead-intake";
import { resolveLeadCrmOwnership } from "@/lib/crm-ownership";
import {
  AGENT_CONTACT_CONSENT_KIND,
  AGENT_CONTACT_CONSENT_VERSION,
} from "@/lib/consent";
import {
  notifyNewLeadCapturedToStaff,
  scheduleNewLeadStaffEmail,
} from "@/lib/notifications/staff-events";
import { resolveLeadDeskNotifiers } from "@/lib/workspace-notification-recipients";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  mlsNumber: z.string().min(3).max(32),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(40).optional(),
  message: z.string().trim().max(2000).optional(),
  kind: z.enum(["inquiry", "showing", "virtual_viewing"]),
  preferredTimes: z.string().trim().max(500).optional(),
  focusNotes: z.string().trim().max(1000).optional(),
  contactConsent: z.literal(true),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmContent: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      const consentMissing = parsed.error.issues.some(
        (issue) => issue.path[0] === "contactConsent",
      );
      return NextResponse.json(
        {
          error: consentMissing
            ? "Please agree to be contacted by a Houzzat agent."
            : "Please fill in name, email, and a valid listing.",
        },
        { status: 400 },
      );
    }

    const session = await auth();
    const data = parsed.data;
    const listing = await prisma.listing.findUnique({
      where: { mlsNumber: data.mlsNumber },
      select: { mlsNumber: true, addressLine: true, city: true },
    });

    if (!listing) {
      return NextResponse.json({ error: "Listing not found." }, { status: 404 });
    }

    const source =
      data.kind === "virtual_viewing"
        ? "VIRTUAL_VIEWING"
        : data.kind === "showing"
          ? "SHOWING_REQUEST"
          : "PROPERTY_INQUIRY";

    const appointmentType =
      data.kind === "virtual_viewing"
        ? "VIRTUAL_VIEWING"
        : data.kind === "showing"
          ? "SHOWING"
          : null;

    const score =
      data.kind === "virtual_viewing" ? 55 : data.kind === "showing" ? 40 : 25;

    const desk = await resolvePublicLeadDesk();
    let customerFlags = { isBuyer: true, isSeller: false };
    if (session?.user?.id) {
      const customer = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { isBuyer: true, isSeller: true },
      });
      if (customer) customerFlags = customer;
    }
    const intent = resolveLeadIntent(customerFlags);
    const routed = await resolveLeadDeskAssignment(intent);
    const organizationId = routed.organizationId ?? desk.organizationId;
    const assignedAgentId = routed.assigneeId;
    const deskNotifiers = await resolveLeadDeskNotifiers({
      organizationId,
      workspaceId: routed.workspaceId,
    });

    const utm = pickUtm(data);
    const adCampaignId = await resolveAdCampaignId(utm);
    const consentAt = new Date();
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() ?? null;
    const userAgent = request.headers.get("user-agent");

    const lead = await prisma.$transaction(async (tx) => {
      const ownership = await resolveLeadCrmOwnership(organizationId);
      const created = await tx.lead.create({
        data: {
          source,
          status: "NEW_LEAD",
          intent,
          score,
          listingMls: listing.mlsNumber,
          customerId: session?.user?.id,
          assignedAgentId,
          organizationId: ownership.organizationId ?? organizationId ?? undefined,
          workspaceId: ownership.workspaceId,
          contactConsentAt: consentAt,
          ...utmLeadFields(utm, adCampaignId),
          notes: [
            `Contact: ${data.name} <${data.email}>`,
            data.phone ? `Phone: ${data.phone}` : null,
            data.preferredTimes
              ? `Preferred times: ${data.preferredTimes}`
              : null,
            data.focusNotes ? `Focus: ${data.focusNotes}` : null,
            data.message ? `Message: ${data.message}` : null,
            `Property: ${listing.addressLine}, ${listing.city}`,
            data.kind === "virtual_viewing"
              ? "Type: Virtual Viewing (agent on-site video walkthrough)"
              : null,
            `Contact consent: yes (${AGENT_CONTACT_CONSENT_VERSION})`,
          ]
            .filter(Boolean)
            .join("\n"),
          activities: {
            create: {
              type:
                data.kind === "virtual_viewing"
                  ? "virtual_viewing_request"
                  : data.kind === "showing"
                    ? "showing_request"
                    : "inquiry",
              userId: session?.user?.id,
              body: data.message ?? null,
              meta: {
                email: data.email,
                phone: data.phone,
                preferredTimes: data.preferredTimes,
                focusNotes: data.focusNotes,
                contactConsent: true,
                contactConsentAt: consentAt.toISOString(),
                contactConsentVersion: AGENT_CONTACT_CONSENT_VERSION,
              },
            },
          },
          ...(appointmentType
            ? {
                appointments: {
                  create: {
                    type: appointmentType,
                    status: "REQUESTED",
                    listingMls: listing.mlsNumber,
                    customerId: session?.user?.id,
                    agentId: assignedAgentId,
                    notes: data.preferredTimes ?? data.message ?? null,
                    focusNotes: data.focusNotes,
                  },
                },
              }
            : {}),
        },
      });

      await tx.consentEvent.create({
        data: {
          userId: session?.user?.id,
          leadId: created.id,
          email: data.email.toLowerCase(),
          kind: AGENT_CONTACT_CONSENT_KIND,
          version: AGENT_CONTACT_CONSENT_VERSION,
          ip,
          userAgent,
        },
      });

      if (session?.user?.id) {
        await tx.user.update({
          where: { id: session.user.id },
          data: {
            caslConsentAt: consentAt,
            ...(data.phone ? { phone: data.phone } : {}),
          },
        });
      }

      return created;
    });

    const hotRequest =
      data.kind === "virtual_viewing" || data.kind === "showing";
    const deskUserIds = deskNotifiers.map((row) => row.user.id);
    const pushLabel = hotRequest
      ? `${data.name} · ${data.kind.replaceAll("_", " ")} · ${listing.addressLine}`
      : `${data.name} · ${listing.addressLine}`;

    // Push before task — task failure must not block new_lead delivery.
    notifyNewLeadCapturedToStaff({
      leadId: lead.id,
      label: pushLabel,
      assigneeId: assignedAgentId,
      deskUserIds,
    });

    scheduleNewLeadStaffEmail({
      leadId: lead.id,
      source: "listing_inquiry",
      subject: `New Houzzat lead: ${source.replaceAll("_", " ")}`,
      detailLines: [
        `Listing: ${listing.addressLine}, ${listing.city} (MLS® ${listing.mlsNumber})`,
        `Contact: ${data.name}`,
        `Email: ${data.email}`,
        data.phone ? `Phone: ${data.phone}` : null,
        hotRequest
          ? `Request: ${data.kind.replaceAll("_", " ")}`
          : `Source: ${source.replaceAll("_", " ")}`,
        "Consent: agent contact accepted",
      ].filter((line): line is string => Boolean(line)),
      assigneeId: assignedAgentId,
      deskRecipients: deskNotifiers.map((row) => ({
        id: row.user.id,
        email: row.user.email,
        phone: row.user.phone,
      })),
      smsText: `Houzzat lead: ${listing.addressLine} — ${data.name}. Check agent desk.`,
      whatsappText: hotRequest
        ? `Hot Houzzat lead (${data.kind.replaceAll("_", " ")}): ${listing.addressLine} — ${data.name}.`
        : undefined,
      preferWhatsApp: hotRequest,
    });

    if (assignedAgentId && organizationId) {
      try {
        await createCallNewLeadTask({
          leadId: lead.id,
          assigneeId: assignedAgentId,
          organizationId,
        });
      } catch (err) {
        console.error("[leads] call-new-lead-task failed", {
          leadId: lead.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({ ok: true, leadId: lead.id });
  } catch (error) {
    console.error("[leads]", error);
    return NextResponse.json(
      { error: "Could not submit request." },
      { status: 500 },
    );
  }
}
