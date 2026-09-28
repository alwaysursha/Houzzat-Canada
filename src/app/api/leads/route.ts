import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import { resolveAdCampaignId, utmLeadFields } from "@/lib/ads/attribution";
import { pickUtm } from "@/lib/ads/utm";
import {
  publicLeadNotificationCopy,
  publicLeadRoutingErrorResponse,
  publicResolveOrCreateLead,
} from "@/lib/agent/public-lead-api";
import {
  applyCanonicalCustomerContact,
  type MaterialLeadInfoChange,
} from "@/lib/agent/lead-info-change";
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
import { parsePhoneColumnsForWrite } from "@/lib/sms/e164";
import { scheduleViewingRequestedSmsAutomation } from "@/lib/sms/automations";

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

    const customer = await requireCustomerUser();
    if (!customer || !isConsumerRole(customer.role)) {
      return NextResponse.json(
        { error: "Sign in to send this request.", requiresAuth: true },
        { status: 401 },
      );
    }
    const data = parsed.data;
    const parsedPhone = data.phone
      ? parsePhoneColumnsForWrite(data.phone)
      : null;
    if (parsedPhone && !parsedPhone.ok) {
      return NextResponse.json({ error: parsedPhone.error }, { status: 400 });
    }
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

    let contactChanges: MaterialLeadInfoChange[] = [];
    {
      const applied = await applyCanonicalCustomerContact(prisma, customer.id, {
        name: data.name,
        email: data.email,
        phone: data.phone,
      });
      if (!applied.ok) {
        return NextResponse.json(
          { error: applied.error },
          { status: applied.status },
        );
      }
      contactChanges = applied.changes;
    }

    const resolved = await publicResolveOrCreateLead({
      request,
      intent,
      isBuyer: customerFlags.isBuyer === true,
      isSeller: customerFlags.isSeller === true,
      source,
      customerId: customer.id,
      email: data.email,
      phone: data.phone,
      name: data.name,
      score,
      listingMls: listing.mlsNumber,
      contactConsentAt: consentAt,
      actorId: customer.id,
      upsertCustomer: false,
      contactChanges,
      utm: utmLeadFields(utm, adCampaignId),
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
          email: data.email,
          phone: data.phone,
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
        email: data.email.toLowerCase(),
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
        ? `${data.name} · ${data.kind.replaceAll("_", " ")} · ${listing.addressLine}`
        : `${data.name} · ${listing.addressLine}`;

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
        smsText: `${notify.smsPrefix}: ${listing.addressLine} — ${data.name}. Check agent desk.`,
        whatsappText: hotRequest
          ? `Hot ${notify.smsPrefix} (${data.kind.replaceAll("_", " ")}): ${listing.addressLine} — ${data.name}.`
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
