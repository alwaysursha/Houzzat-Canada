import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { resolveAdCampaignId, utmLeadFields } from "@/lib/ads/attribution";
import { pickUtm } from "@/lib/ads/utm";
import { pickAssigneeAgentId } from "@/lib/agent";
import {
  AGENT_CONTACT_CONSENT_KIND,
  AGENT_CONTACT_CONSENT_VERSION,
} from "@/lib/consent";
import { sendNotification } from "@/lib/notifications";
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

    const assigneeId = await pickAssigneeAgentId();
    const assignee = assigneeId
      ? await prisma.user.findUnique({
          where: { id: assigneeId },
          select: { email: true, phone: true, name: true },
        })
      : null;

    const utm = pickUtm(data);
    const adCampaignId = await resolveAdCampaignId(utm);
    const consentAt = new Date();
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() ?? null;
    const userAgent = request.headers.get("user-agent");

    const lead = await prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          source,
          status: "NEW",
          score,
          listingMls: listing.mlsNumber,
          customerId: session?.user?.id,
          assignedAgentId: assigneeId,
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
                    agentId: assigneeId,
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

    if (assignee?.email) {
      void sendNotification({
        toEmail: assignee.email,
        toPhone: assignee.phone,
        subject: `New Houzzat lead: ${source.replaceAll("_", " ")}`,
        text: `New lead for ${listing.addressLine}, ${listing.city} (${listing.mlsNumber}).\nContact: ${data.name} <${data.email}>\n${data.phone ? `Phone: ${data.phone}\n` : ""}Consent: agent contact accepted\nOpen agent desk: /agent/leads/${lead.id}`,
        smsText: `Houzzat lead: ${listing.addressLine} — ${data.name}. Check agent desk.`,
        whatsappText:
          data.kind === "virtual_viewing" || data.kind === "showing"
            ? `Hot Houzzat lead (${data.kind.replaceAll("_", " ")}): ${listing.addressLine} — ${data.name}. /agent/leads/${lead.id}`
            : undefined,
        preferWhatsApp:
          data.kind === "virtual_viewing" || data.kind === "showing",
      });
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
