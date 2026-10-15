import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { resolveAdCampaignId, utmLeadFields } from "@/lib/ads/attribution";
import { pickUtm } from "@/lib/ads/utm";
import {
  applyCanonicalCustomerContact,
  composeCustomerDisplayName,
  type MaterialLeadInfoChange,
} from "@/lib/agent/lead-info-change";
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
import {
  estimateHomeValue,
  type EstimateHomeValueResult,
  type HomeValueEstimateOk,
} from "@/lib/market/home-value-estimate";
import { sendNotification } from "@/lib/notifications";
import {
  notifyNewLeadCapturedToStaff,
  scheduleNewLeadStaffEmail,
} from "@/lib/notifications/staff-events";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";
import { isConsumerRole } from "@/lib/roles";
import {
  InvalidContactPhoneError,
  isInvalidContactPhoneError,
  parsePhoneColumnsForWrite,
} from "@/lib/sms/e164";
import { hasClientAccess, VOW_VERSION } from "@/lib/vow";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
import { resolveLeadCaptureTenancy } from "@/lib/agent/lead-intake";
import { resolveListingEntitlementContextForRequest } from "@/lib/tenancy/listing-entitlement";

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
  firstName: z.string().trim().max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
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
  /** Ignored — client-supplied ranges are not authoritative (V1). */
  estimatedLow: z.number().optional(),
  estimatedHigh: z.number().optional(),
  estimatedMid: z.number().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmContent: z.string().optional(),
});

function estimatePayload(estimate: HomeValueEstimateOk) {
  return {
    low: estimate.low,
    mid: estimate.mid,
    high: estimate.high,
    sampleSize: estimate.sampleSize,
    soldCount: estimate.soldCount,
    activeCount: estimate.activeCount,
    method: estimate.method,
    confidence: estimate.confidence,
    city: estimate.city,
    community: estimate.community,
    communityAvgSold: estimate.communityAvgSold,
    communitySoldCount: estimate.communitySoldCount,
    disclaimer:
      "Indicative range from recent sold comparables in Houzzat’s entitled inventory. Not a formal appraisal or guarantee of sale price. A local review sharpens the number for your specific property.",
  };
}

function valuationNotesEstimateLines(
  result: EstimateHomeValueResult,
): string[] {
  if (result.status !== "OK") {
    return [
      "Estimate status: INSUFFICIENT_DATA",
      `Reason: ${result.reason}`,
    ];
  }
  return [
    `Indicative range: $${result.low.toLocaleString()} – $${result.high.toLocaleString()} (mid $${result.mid.toLocaleString()})`,
    `Method: sold comps; confidence=${result.confidence}; sample=${result.sampleSize}; sold=${result.soldCount}`,
    result.communityAvgSold
      ? `Community avg sold: $${result.communityAvgSold.toLocaleString()} (n=${result.communitySoldCount})`
      : null,
  ].filter((line): line is string => Boolean(line));
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
  workspaceId: string;
}): Promise<{
  userId: string;
  accountCreated: boolean;
  contactChanges: MaterialLeadInfoChange[];
}> {
  const email = opts.email.toLowerCase();
  // Phase 3: never resolve User by global email — workspace-scoped only.
  const existing = await prisma.user.findFirst({
    where: { email, workspaceId: opts.workspaceId },
    select: { id: true, role: true, isBuyer: true, isSeller: true },
  });

  if (existing) {
    if (existing.role === "AGENT") {
      return { userId: existing.id, accountCreated: false, contactChanges: [] };
    }
    const applied = await applyCanonicalCustomerContact(prisma, existing.id, {
      name: opts.name,
      phone: opts.phone,
      homeAddress: opts.address,
      homeLat: opts.lat,
      homeLng: opts.lng,
    });
    if (!applied.ok) throw new InvalidContactPhoneError(applied.error);
    await prisma.user.update({
      where: { id: existing.id },
      data: {
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
    return {
      userId: existing.id,
      accountCreated: false,
      contactChanges: applied.ok ? applied.changes : [],
    };
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
      workspaceId: opts.workspaceId,
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

  return { userId: user.id, accountCreated: true, contactChanges: [] };
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
    const contactName = composeCustomerDisplayName(
      data.firstName,
      data.lastName,
      data.name,
    );
    const hasContact = Boolean(contactName && data.email?.trim());

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
    const { entitlement } =
      await resolveListingEntitlementContextForRequest(request);

    // Sold-derived dollars require VOW/client access (server-side).
    let accessUser: {
      id: string;
      emailVerified: Date | null;
      createdAt: Date;
    } | null = null;
    if (session?.user?.id) {
      accessUser = await prisma.user
        .findUnique({
          where: { id: session.user.id },
          select: { id: true, emailVerified: true, createdAt: true },
        })
        .catch(() => null);
    }
    const canSeeSoldValuation = hasClientAccess(accessUser);

    if (estimateOnly) {
      if (!canSeeSoldValuation) {
        return NextResponse.json({
          ok: true,
          status: "AUTH_REQUIRED",
          estimate: null,
          message:
            "Sign in as a registered client to view sold-based home estimates.",
        });
      }
      // Never trust client estimatedLow/High — always recompute when authorized.
      const estimateResult = await estimateHomeValue({
        city: data.city,
        community: data.community,
        beds: data.beds,
        baths: data.baths,
        sqft: data.sqft,
        basement: data.basement,
        propertyType: data.propertyType,
        lat: data.lat,
        lng: data.lng,
        entitlement,
      });
      if (estimateResult.status === "INSUFFICIENT_DATA") {
        return NextResponse.json({
          ok: true,
          status: "INSUFFICIENT_DATA",
          estimate: null,
          reason: estimateResult.reason,
          city: estimateResult.city,
          community: estimateResult.community,
          message:
            "We don't have enough reliable comparable property data to provide an accurate estimate for this home.",
        });
      }
      return NextResponse.json({
        ok: true,
        status: "OK",
        estimate: estimatePayload(estimateResult),
      });
    }

    const contactNameResolved =
      contactName ||
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
    let contactChanges: MaterialLeadInfoChange[] = [];
    const sessionIsConsumer = isConsumerRole(session?.user?.role);

    const tenancy = await resolveLeadCaptureTenancy(request);
    if (!tenancy.workspaceId) {
      return NextResponse.json(
        { error: "Valuation requires a verified tenant website." },
        { status: 400 },
      );
    }

    // Only attach the signed-in User when their home workspace matches this hostname.
    let sessionCustomerUsable = false;
    if (sessionIsConsumer && session?.user?.id) {
      const sessionUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { workspaceId: true, role: true },
      });
      sessionCustomerUsable =
        sessionUser?.workspaceId != null &&
        sessionUser.workspaceId === tenancy.workspaceId;
      if (!sessionCustomerUsable) {
        customerId = undefined;
      }
    }

    if (sessionCustomerUsable && session?.user?.id && !isQuick && hasContact) {
      const applied = await applyCanonicalCustomerContact(
        prisma,
        session.user.id,
        {
          firstName: data.firstName,
          lastName: data.lastName,
          name: data.name,
          email: data.email,
          phone: data.phone,
          homeAddress: data.address,
          homeLat: data.lat,
          homeLng: data.lng,
        },
      );
      if (!applied.ok) {
        return NextResponse.json(
          { error: applied.error },
          { status: applied.status },
        );
      }
      contactChanges = applied.changes;
      customerId = session.user.id;
      const consumer = await prisma.user.findFirst({
        where: { id: session.user.id },
        select: { role: true },
      });
      if (consumer && consumer.role !== "ADMIN") {
        await prisma.user.update({
          where: { id: session.user.id },
          data: {
            isSeller: true,
            isBuyer: true,
            activeMode: "SELLER",
            ...(data.marketingOptIn ||
            data.marketPulseOptIn ||
            data.neighbourhoodSalesOptIn
              ? { emailAlertsEnabled: true }
              : {}),
          },
        });
      }
    } else if (!isQuick && hasContact && contactEmail !== "pending@houzzat.ca") {
      const ensured = await ensureOwnerCustomer({
        email: contactEmail,
        name: contactNameResolved,
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
        workspaceId: tenancy.workspaceId,
      });
      customerId = ensured.userId;
      accountCreated = ensured.accountCreated;
      contactChanges = ensured.contactChanges;
    }

    const isSellerCapture = data.intent === "sell" || isQuick;
    const intent = resolveLeadIntent({
      isBuyer: !isSellerCapture,
      isSeller: isSellerCapture,
    });

    const utm = pickUtm(data);
    const adCampaignId = await resolveAdCampaignId(utm);

    // Recompute after customer ensure so notes always use server authority.
    const estimateForLead = await estimateHomeValue({
      city: data.city,
      community: data.community,
      beds: data.beds,
      baths: data.baths,
      sqft: data.sqft,
      basement: data.basement,
      propertyType: data.propertyType,
      lat: data.lat,
      lng: data.lng,
      entitlement,
    });

    const resolved = await publicResolveOrCreateLead({
      request,
      intent,
      isBuyer: !isSellerCapture,
      isSeller: isSellerCapture,
      source: "HOME_VALUATION",
      customerId,
      email: contactEmail,
      phone: data.phone,
      name: contactNameResolved,
      score: data.intent === "sell" ? 72 : data.intent === "buy" ? 40 : 45,
      contactConsentAt: new Date(),
      actorId: customerId ?? session?.user?.id,
      upsertCustomer: false,
      contactChanges,
      utm: utmLeadFields(utm, adCampaignId),
      notes: [
        `Home valuation for ${data.address}`,
        data.city ? `City: ${data.city}` : null,
        estimateForLead.community
          ? `Community: ${estimateForLead.community}`
          : data.community
            ? `Community: ${data.community}`
            : null,
        data.propertyType ? `Type: ${data.propertyType}` : null,
        data.beds != null ? `Beds: ${data.beds}` : null,
        data.baths != null ? `Baths: ${data.baths}` : null,
        data.sqft != null ? `Sqft: ${data.sqft}` : null,
        data.basement ? `Basement: ${data.basement}` : null,
        `Intent: ${data.intent}`,
        accountCreated
          ? "Seller profile created (buyer+seller, owner desk)"
          : null,
        isQuick ? "Captured from homepage Sell a Home → Get Estimate" : null,
        ...valuationNotesEstimateLines(estimateForLead),
        `Contact: ${contactNameResolved} <${contactEmail}>`,
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
          estimateStatus: estimateForLead.status,
          estimate:
            estimateForLead.status === "OK" ? estimateForLead : null,
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
          `Contact: ${contactNameResolved}`,
          `Email: ${contactEmail}`,
          estimateForLead.status === "OK"
            ? `Estimate range: $${estimateForLead.low.toLocaleString()}–$${estimateForLead.high.toLocaleString()}`
            : `Estimate: INSUFFICIENT_DATA (${estimateForLead.reason})`,
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

    // Sold-derived dollars: session must pass hasClientAccess (VOW policy).
    // Registration / customerId alone must never bypass — lead capture still succeeds.
    const mayDiscloseSoldEstimate = canSeeSoldValuation;

    const disclosedEstimate =
      mayDiscloseSoldEstimate && estimateForLead.status === "OK"
        ? estimatePayload(estimateForLead)
        : null;

    return NextResponse.json({
      ok: true,
      leadId: lead.id,
      accountCreated,
      status:
        disclosedEstimate
          ? "OK"
          : estimateForLead.status === "INSUFFICIENT_DATA"
            ? "INSUFFICIENT_DATA"
            : "AUTH_REQUIRED",
      estimate: disclosedEstimate,
      reason:
        estimateForLead.status === "INSUFFICIENT_DATA"
          ? estimateForLead.reason
          : undefined,
      message:
        disclosedEstimate
          ? undefined
          : estimateForLead.status === "INSUFFICIENT_DATA"
            ? "We don't have enough reliable comparable property data to provide an accurate estimate for this home."
            : "Sign in as a registered client to view sold-based home estimates.",
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
