import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import { resolveAdCampaignId, utmLeadFields } from "@/lib/ads/attribution";
import { pickUtm } from "@/lib/ads/utm";
import { scheduleRegistrationEngaged } from "@/lib/funnel/phase2c";
import {
  publicLeadNotificationCopy,
  publicLeadRoutingErrorResponse,
  publicResolveOrCreateLead,
} from "@/lib/agent/public-lead-api";
import { isConsumerRole } from "@/lib/roles";
import {
  createCallNewLeadTask,
  resolveLeadIntent,
} from "@/lib/agent/lead-intake";
import {
  AGENT_CONTACT_CONSENT_KIND,
  AGENT_CONTACT_CONSENT_VERSION,
} from "@/lib/consent";
import {
  notifyNewLeadCapturedToStaff,
  scheduleNewLeadStaffEmail,
} from "@/lib/notifications/staff-events";
import { prisma } from "@/lib/prisma";
import { currentPublicBrandName } from "@/lib/tenancy/resolve-marketing-tenancy";
import { scheduleViewingRequestedSmsAutomation } from "@/lib/sms/automations";
import { isHighOctaneDevelopmentListingMls } from "@/lib/tenancy/templates/high-octane-development-listings";

const schema = z.object({
  mlsNumber: z.string().min(3).max(32),
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
              ? `Please agree to be contacted by a ${(await currentPublicBrandName())} agent.`
              : "Please choose a valid listing.",
          },
        { status: 400 },
      );
    }

    const customer = await requireCustomerUser();
    if (!customer || !isConsumerRole(customer.role)) {
      return NextResponse.json(
        { error: "Sign in to send this request.", requiresAuth: true },
        { status: 401 },
      );
    }
    const data = parsed.data;
    if (isHighOctaneDevelopmentListingMls(data.mlsNumber)) {
      return NextResponse.json(
        { error: "This demonstration property does not accept inquiries." },
        { status: 403 },
      );
    }
    const contactName = customer.name?.trim() || customer.email;
    const contactEmail = customer.email;
    const contactPhone = customer.phone?.trim() || null;
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

    let customerFlags = { isBuyer: true, isSeller: false };
    const account = await prisma.user.findUnique({
      where: { id: customer.id },
      select: { isBuyer: true, isSeller: true },
    });
    if (account) customerFlags = account;
    const intent = resolveLeadIntent(customerFlags);

    const utm = pickUtm(data);
    const adCampaignId = await resolveAdCampaignId(utm);
    const consentAt = new Date();
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() ?? null;
    const userAgent = request.headers.get("user-agent");

    const resolved = await publicResolveOrCreateLead({
      request,
      intent,
      isBuyer: customerFlags.isBuyer === true,
      isSeller: customerFlags.isSeller === true,
      source,
      customerId: customer.id,
      email: contactEmail,
      phone: contactPhone,
      name: contactName,
      score,
      listingMls: listing.mlsNumber,
      contactConsentAt: consentAt,
      actorId: customer.id,
      upsertCustomer: false,
      contactChanges: [],
      utm: utmLeadFields(utm, adCampaignId),
      notes: [
        `Contact: ${contactName} <${contactEmail}>`,
        contactPhone ? `Phone: ${contactPhone}` : null,
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
      activity: {
        type:
          data.kind === "virtual_viewing"
            ? "virtual_viewing_request"
            : data.kind === "showing"
              ? "showing_request"
              : "inquiry",
        userId: customer.id,
        body: data.message ?? null,
        meta: {
          email: contactEmail,
          phone: contactPhone,
          preferredTimes: data.preferredTimes,
          focusNotes: data.focusNotes,
          contactConsent: true,
          contactConsentAt: consentAt.toISOString(),
          contactConsentVersion: AGENT_CONTACT_CONSENT_VERSION,
        },
      },
    });

    const lead = resolved.lead;
    const assignedAgentId = resolved.assignedAgentId;
    const organizationId = resolved.organizationId;
    const brand = resolved.brand;
    const deskNotifiers = resolved.deskNotifiers;
    const notify = publicLeadNotificationCopy(brand, source.replaceAll("_", " "));

    await prisma.consentEvent.create({
      data: {
        userId: customer.id,
        leadId: lead.id,
        email: contactEmail.toLowerCase(),
        kind: AGENT_CONTACT_CONSENT_KIND,
        version: AGENT_CONTACT_CONSENT_VERSION,
        ip,
        userAgent,
      },
    });

    await prisma.user.update({
      where: { id: customer.id },
      data: {
        caslConsentAt: consentAt,
      },
    });

    if (appointmentType) {
      await prisma.appointment.create({
        data: {
          type: appointmentType,
          status: "REQUESTED",
          listingMls: listing.mlsNumber,
          customerId: customer.id,
          agentId: assignedAgentId,
          notes: data.preferredTimes ?? data.message ?? null,
          focusNotes: data.focusNotes,
          leadId: lead.id,
        },
      });
    }

    const hotRequest =
      data.kind === "virtual_viewing" || data.kind === "showing";
    if (resolved.created) {
      const deskUserIds = deskNotifiers.map((row) => row.user.id);
      const pushLabel = hotRequest
        ? `${contactName} · ${data.kind.replaceAll("_", " ")} · ${listing.addressLine}`
        : `${contactName} · ${listing.addressLine}`;

      notifyNewLeadCapturedToStaff({
        leadId: lead.id,
        label: pushLabel,
        title: notify.pushTitle,
        assigneeId: assignedAgentId,
        deskUserIds,
      });

      scheduleNewLeadStaffEmail({
        leadId: lead.id,
        source: "listing_inquiry",
        subject: notify.emailSubject,
        detailLines: [
          `Listing: ${listing.addressLine}, ${listing.city} (MLS® ${listing.mlsNumber})`,
          `Contact: ${contactName}`,
          `Email: ${contactEmail}`,
          contactPhone ? `Phone: ${contactPhone}` : null,
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
        smsText: `${notify.smsPrefix}: ${listing.addressLine} — ${contactName}. Check agent desk.`,
        whatsappText: hotRequest
          ? `Hot ${notify.smsPrefix} (${data.kind.replaceAll("_", " ")}): ${listing.addressLine} — ${contactName}.`
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
    }

    if (hotRequest) {
      scheduleViewingRequestedSmsAutomation(
        lead.id,
        `${listing.addressLine}, ${listing.city}`,
      );
    }

    scheduleRegistrationEngaged({
      request,
      user: customer,
      engagementType:
        data.kind === "inquiry" ? "CONTACT_AGENT" : "REQUEST_VIEWING",
      mlsNumber: listing.mlsNumber,
    });

    return NextResponse.json({ ok: true, leadId: lead.id });
  } catch (error) {
    const routingError = publicLeadRoutingErrorResponse(error);
    if (routingError) return routingError;
    console.error("[leads]", error);
    return NextResponse.json(
      { error: "Could not submit request." },
      { status: 500 },
    );
  }
}
