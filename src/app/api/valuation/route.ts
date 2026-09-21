import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { resolveAdCampaignId, utmLeadFields } from "@/lib/ads/attribution";
import { pickUtm } from "@/lib/ads/utm";
import {
  publicLeadNotificationCopy,
  publicLeadRoutingErrorResponse,
  publicResolveOrCreateLead,
} from "@/lib/agent/public-lead-api";
import {
  createCallNewLeadTask,
  resolveLeadIntent,
} from "@/lib/agent/lead-intake";
import { TERMS_ACCEPT_KIND, TERMS_VERSION } from "@/lib/consent";
import { estimateHomeValue } from "@/lib/market/home-value-estimate";
import { sendNotification } from "@/lib/notifications";
import {
  notifyNewLeadCapturedToStaff,
  scheduleNewLeadStaffEmail,
} from "@/lib/notifications/staff-events";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";
import {
  InvalidContactPhoneError,
  isInvalidContactPhoneError,
  parsePhoneColumnsForWrite,
} from "@/lib/sms/e164";
import { VOW_VERSION } from "@/lib/vow";
import { SITE_NAME, SITE_URL } from "@/lib/constants";

const basementSchema = z.enum(["finished", "unfinished", "none", "unknown"]);

const schema = z.object({
  address: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(80).optional(),
  community: z.string().trim().max(80).optional(),
  propertyType: z
    .enum([
      "DETACHED",
      "SEMI_DETACHED",
      "TOWNHOUSE",
      "CONDO_APT",
      "CONDO_TOWNHOUSE",
      "MULTIPLEX",
      "VACANT_LAND",
      "OFFICE",
      "RETAIL",
      "INDUSTRIAL",
      "MIXED_USE",
      "OTHER",
    ])
    .optional(),
  beds: z.number().min(0).max(20).optional(),
  baths: z.number().min(0).max(20).optional(),
  sqft: z.number().min(200).max(20000).optional(),
  basement: basementSchema.optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  email: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined)
    .pipe(z.string().email().optional()),
  phone: z.string().trim().max(40).optional(),
  intent: z.enum(["sell", "buy", "curious"]).default("sell"),
  marketingOptIn: z.boolean().optional(),
  marketPulseOptIn: z.boolean().optional(),
  neighbourhoodSalesOptIn: z.boolean().optional(),
  acceptTerms: z.boolean().optional(),
  quick: z.boolean().optional(),
  /** Live preview refresh — estimate only, no lead / account side effects. */
  estimateOnly: z.boolean().optional(),
  estimatedLow: z.number().optional(),
  estimatedHigh: z.number().optional(),
  estimatedMid: z.number().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmContent: z.string().optional(),
});

function estimatePayload(estimate: Awaited<ReturnType<typeof estimateHomeValue>>) {
  return {
    low: estimate.low,
    mid: estimate.mid,
    high: estimate.high,
    sampleSize: estimate.sampleSize,
    soldCount: estimate.soldCount,
    activeCount: estimate.activeCount,
    method: estimate.method,
    city: estimate.city,
    community: estimate.community,
    communityAvgSold: estimate.communityAvgSold,
    communitySoldCount: estimate.communitySoldCount,
    disclaimer:
      "Indicative range from Houzzat’s Ontario listing inventory (recent solds and active homes). Not a formal appraisal or guarantee of sale price. A local review sharpens the number for your specific property.",
  };
}

function requestClientMeta(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    undefined;
  const userAgent = request.headers.get("user-agent") || undefined;
  return { ip, userAgent };
}

/**
 * Ensure a seller (and buyer) consumer account exists for this valuation lead.
 * Flat writes only — nested Prisma creates break on PrismaNeonHttp (Workers).
 */
async function ensureOwnerCustomer(opts: {
  email: string;
  name: string;
  phone?: string | null;
  address: string;
  lat?: number | null;
  lng?: number | null;
  marketingOptIn: boolean;
  acceptTerms: boolean;
  request: Request;
}): Promise<{ userId: string; accountCreated: boolean }> {
  const email = opts.email.toLowerCase();
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, isBuyer: true, isSeller: true },
  });

  if (existing) {
    if (existing.role === "AGENT") {
      return { userId: existing.id, accountCreated: false };
    }
    const parsedPhone = opts.phone
      ? parsePhoneColumnsForWrite(opts.phone)
      : { ok: true as const, columns: {} };
    if (!parsedPhone.ok) throw new InvalidContactPhoneError(parsedPhone.error);
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        ...parsedPhone.columns,
        homeAddress: opts.address,
        ...(opts.lat != null && opts.lng != null
          ? { homeLat: opts.lat, homeLng: opts.lng }
          : {}),
        ...(opts.marketingOptIn ? { emailAlertsEnabled: true } : {}),
        ...(existing.role === "ADMIN"
          ? {}
          : {
              isSeller: true,
              isBuyer: true,
              activeMode: "SELLER",
            }),
      },
    });
    return { userId: existing.id, accountCreated: false };
  }

  const now = new Date();
  const parsedPhone = parsePhoneColumnsForWrite(opts.phone || null);
  if (!parsedPhone.ok) throw new InvalidContactPhoneError(parsedPhone.error);
  const tempPassword = randomBytes(18).toString("base64url");
  const password = await bcrypt.hash(tempPassword, 10);
  const { ip, userAgent } = requestClientMeta(opts.request);

  const user = await prisma.user.create({
    data: {
      name: opts.name,
      email,
      password,
      role: "SELLER",
      isBuyer: true,
      isSeller: true,
      activeMode: "SELLER",
      ...parsedPhone.columns,
      homeAddress: opts.address,
      homeLat: opts.lat ?? null,
      homeLng: opts.lng ?? null,
      emailAlertsEnabled: opts.marketingOptIn,
      ...(opts.acceptTerms
        ? {
            termsAcceptedAt: now,
            termsVersion: TERMS_VERSION,
            vowAcceptedAt: now,
            vowVersion: VOW_VERSION,
            caslConsentAt: now,
          }
        : {}),
    },
  });

  if (opts.acceptTerms) {
    await prisma.consentEvent.createMany({
      data: [
        {
          userId: user.id,
          kind: TERMS_ACCEPT_KIND,
          version: TERMS_VERSION,
          email,
          ip,
          userAgent,
        },
        {
          userId: user.id,
          kind: "vow_accept",
          version: VOW_VERSION,
          email,
          ip,
          userAgent,
        },
      ],
    });
  }

  scheduleWorkerSideEffect(
    sendNotification({
      toEmail: email,
      subject: `Your ${SITE_NAME} owner account is ready`,
      text: [
        `Hi ${opts.name},`,
        "",
        `Thanks for requesting a home value estimate for ${opts.address}.`,
        "",
        `We've created your ${SITE_NAME} owner account so you can manage seller tools and (soon) list your home.`,
        `Sign in at ${SITE_URL}/auth/sign-in with this email.`,
        `If you signed up with a temporary password, use Google sign-in or contact us to set a password.`,
        "",
        `— ${SITE_NAME}`,
      ].join("\n"),
    }),
  );

  return { userId: user.id, accountCreated: true };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Please provide a valid home address." },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const isQuick = Boolean(data.quick);
    const estimateOnly = Boolean(data.estimateOnly);
    const hasContact = Boolean(data.name?.trim() && data.email?.trim());

    if (!estimateOnly && !isQuick && !hasContact) {
      return NextResponse.json(
        { error: "Please provide address, name, and email." },
        { status: 400 },
      );
    }

    if (data.phone) {
      const parsedPhone = parsePhoneColumnsForWrite(data.phone);
      if (!parsedPhone.ok) {
        return NextResponse.json({ error: parsedPhone.error }, { status: 400 });
      }
    }

    const session = await auth();
    const estimate =
      data.estimatedLow && data.estimatedHigh
        ? {
            low: data.estimatedLow,
            mid:
              data.estimatedMid ??
              Math.round((data.estimatedLow + data.estimatedHigh) / 2),
            high: data.estimatedHigh,
            sampleSize: 0,
            soldCount: 0,
            activeCount: 0,
            method: "fallback" as const,
            city: data.city ?? null,
            community: data.community ?? null,
            communityAvgSold: null,
            communitySoldCount: 0,
          }
        : await estimateHomeValue({
            city: data.city,
            community: data.community,
            beds: data.beds,
            baths: data.baths,
            sqft: data.sqft,
            basement: data.basement,
            propertyType: data.propertyType,
            lat: data.lat,
            lng: data.lng,
          });

    if (estimateOnly) {
      return NextResponse.json({
        ok: true,
        estimate: estimatePayload(estimate),
      });
    }

    const contactName =
      data.name?.trim() ||
      session?.user?.name ||
      (isQuick ? "Hero sell visitor" : "Valuation visitor");
    const contactEmail =
      data.email?.trim() ||
      session?.user?.email ||
      (isQuick ? "pending@houzzat.ca" : undefined);

    if (!contactEmail) {
      return NextResponse.json(
        { error: "Please provide address, name, and email." },
        { status: 400 },
      );
    }

    let customerId = session?.user?.id ?? undefined;
    let accountCreated = false;

    if (!isQuick && hasContact && contactEmail !== "pending@houzzat.ca") {
      const ensured = await ensureOwnerCustomer({
        email: contactEmail,
        name: contactName,
        phone: data.phone,
        address: data.address,
        lat: data.lat,
        lng: data.lng,
        marketingOptIn: Boolean(
          data.marketingOptIn ||
            data.marketPulseOptIn ||
            data.neighbourhoodSalesOptIn,
        ),
        acceptTerms: data.acceptTerms !== false,
        request,
      });
      customerId = ensured.userId;
      accountCreated = ensured.accountCreated;
    }

    const isSellerCapture = data.intent === "sell" || isQuick;
    const intent = resolveLeadIntent({
      isBuyer: !isSellerCapture,
      isSeller: isSellerCapture,
    });

    const utm = pickUtm(data);
    const adCampaignId = await resolveAdCampaignId(utm);

    const methodLabel =
      estimate.method === "sold_comps"
        ? "recent sold comps"
        : estimate.method === "active_listings"
          ? "active listings"
          : estimate.method === "blended"
            ? "sold comps + active listings"
            : "market fallback";

    const resolved = await publicResolveOrCreateLead({
      request,
      intent,
      isBuyer: !isSellerCapture,
      isSeller: isSellerCapture,
      source: "HOME_VALUATION",
      customerId,
      email: contactEmail,
      phone: data.phone,
      name: contactName,
      score: data.intent === "sell" ? 72 : data.intent === "buy" ? 40 : 45,
      contactConsentAt: new Date(),
      actorId: customerId ?? session?.user?.id,
      upsertCustomer: false,
      utm: utmLeadFields(utm, adCampaignId),
      notes: [
        `Home valuation for ${data.address}`,
        data.city ? `City: ${data.city}` : null,
        estimate.community
          ? `Community: ${estimate.community}`
          : data.community
            ? `Community: ${data.community}`
            : null,
        data.propertyType ? `Type: ${data.propertyType}` : null,
        data.beds != null ? `Beds: ${data.beds}` : null,
        data.baths != null ? `Baths: ${data.baths}` : null,
        data.sqft != null ? `Sqft: ${data.sqft}` : null,
        data.basement ? `Basement: ${data.basement}` : null,
        estimate.communityAvgSold
          ? `Community avg sold: $${estimate.communityAvgSold.toLocaleString()} (n=${estimate.communitySoldCount})`
          : null,
        `Intent: ${data.intent}`,
        accountCreated
          ? "Seller profile created (buyer+seller, owner desk)"
          : null,
        isQuick ? "Captured from homepage Sell a Home → Get Estimate" : null,
        `Indicative range: $${estimate.low.toLocaleString()} – $${estimate.high.toLocaleString()} (mid $${estimate.mid.toLocaleString()})`,
        `Method: ${methodLabel}; sample=${estimate.sampleSize}; sold=${estimate.soldCount}; active=${estimate.activeCount}`,
        `Contact: ${contactName} <${contactEmail}>`,
        data.phone ? `Phone: ${data.phone}` : null,
        data.marketingOptIn ||
        data.marketPulseOptIn ||
        data.neighbourhoodSalesOptIn
          ? "Opted in to market updates"
          : null,
        data.marketPulseOptIn ? "Market Pulse: yes" : null,
        data.neighbourhoodSalesOptIn
          ? "Neighbourhood sales alerts: yes"
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
      activity: {
        type: "home_valuation",
        userId: customerId,
        body: data.address,
        meta: {
          email: contactEmail,
          phone: data.phone,
          intent: data.intent,
          quick: isQuick,
          accountCreated,
          estimate,
        },
      },
    });

    const lead = resolved.lead;
    const assignedAgentId = resolved.assignedAgentId;
    const organizationId = resolved.organizationId;
    const brand = resolved.brand;
    const deskNotifiers = resolved.deskNotifiers;
    const notify = publicLeadNotificationCopy(
      brand,
      isQuick ? "homepage sell estimate" : "valuation",
    );

    if (!isQuick) {
      await prisma.appointment.create({
        data: {
          type: "VALUATION_CALL",
          status: "REQUESTED",
          customerId: customerId ?? resolved.customerId,
          agentId: assignedAgentId,
          leadId: lead.id,
          notes: `Valuation follow-up for ${data.address}`,
        },
      });
    }

    if (resolved.created) {
      const deskUserIds = deskNotifiers.map((row) => row.user.id);
      notifyNewLeadCapturedToStaff({
        leadId: lead.id,
        label: data.address,
        title: notify.pushTitle,
        assigneeId: assignedAgentId,
        deskUserIds,
      });

      scheduleNewLeadStaffEmail({
        leadId: lead.id,
        source: "valuation",
        subject: notify.emailSubject,
        detailLines: [
          `Address: ${data.address}`,
          `Contact: ${contactName}`,
          `Email: ${contactEmail}`,
          `Estimate range: $${estimate.low.toLocaleString()}–$${estimate.high.toLocaleString()}`,
          accountCreated ? "Owner account created" : null,
        ].filter((line): line is string => Boolean(line)),
        assigneeId: assignedAgentId,
        deskRecipients: deskNotifiers.map((row) => ({
          id: row.user.id,
          email: row.user.email,
          phone: row.user.phone,
        })),
        smsText: `${notify.smsPrefix}: ${data.address}`,
      });

      if (assignedAgentId && organizationId) {
        try {
          await createCallNewLeadTask({
            leadId: lead.id,
            assigneeId: assignedAgentId,
            organizationId,
          });
        } catch (err) {
          console.error("[valuation] call-new-lead-task failed", {
            leadId: lead.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      leadId: lead.id,
      accountCreated,
      estimate: estimatePayload(estimate),
    });
  } catch (error) {
    if (isInvalidContactPhoneError(error)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const routingError = publicLeadRoutingErrorResponse(error);
    if (routingError) return routingError;
    console.error("[valuation]", error);
    return NextResponse.json(
      { error: "Could not submit valuation." },
      { status: 500 },
    );
  }
}
