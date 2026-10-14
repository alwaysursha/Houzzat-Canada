import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAdCampaignId, utmLeadFields } from "@/lib/ads/attribution";
import { pickUtm } from "@/lib/ads/utm";
import {
  publicLeadRoutingErrorResponse,
  publicResolveOrCreateLead,
} from "@/lib/agent/public-lead-api";
import { createCallNewLeadTask } from "@/lib/agent/lead-intake";
import { BookDemoPublicError } from "@/lib/platform/public/book-demo";
import { normalizeProspectEmail } from "@/lib/platform/prospects/normalize-email";
import {
  SELLER_READINESS_TURNSTILE_ACTION,
  SELLER_READINESS_TURNSTILE_ALLOWED_HOSTNAMES,
  SELLER_READINESS_TURNSTILE_ERROR_MESSAGE,
} from "@/lib/platform/public/turnstile-constants";
import {
  hostnameFromPublicRequest,
  verifyTurnstileToken,
} from "@/lib/platform/public/turnstile-verify";
import { prisma } from "@/lib/prisma";
import {
  allowSellerReadinessRequest,
  clientIpFromPublicRequest,
  isHoneypotTripped,
  SELLER_READINESS_GENERIC_ERROR,
  SELLER_READINESS_HONEYPOT_FIELD,
  SELLER_READINESS_RATE_LIMIT_ERROR,
  validateSellerReadinessFields,
} from "@/lib/tools/seller-readiness-abuse";

export const runtime = "nodejs";

const schema = z.object({
  address: z.string().min(3).max(200),
  name: z.string().min(1).max(80),
  email: z.string().email().max(254),
  score: z.number().min(0).max(100),
  checks: z.record(z.string(), z.boolean()).optional(),
  turnstileToken: z.string().min(1).max(4096),
  utmSource: z.string().max(200).optional(),
  utmMedium: z.string().max(200).optional(),
  utmCampaign: z.string().max(200).optional(),
  utmContent: z.string().max(200).optional(),
  [SELLER_READINESS_HONEYPOT_FIELD]: z.string().max(200).optional(),
});

function publicOk() {
  // Identical success — no leadId / existence leak.
  return NextResponse.json({ ok: true as const });
}

function publicError(status: number, message: string) {
  return NextResponse.json({ ok: false as const, error: message }, { status });
}

export async function POST(request: Request) {
  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return publicError(400, SELLER_READINESS_GENERIC_ERROR);
    }

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return publicError(400, SELLER_READINESS_GENERIC_ERROR);
    }

    // Honeypot: pretend success, create nothing.
    if (isHoneypotTripped(parsed.data[SELLER_READINESS_HONEYPOT_FIELD])) {
      return publicOk();
    }

    const clientIp = clientIpFromPublicRequest(request);
    const requestHostname = hostnameFromPublicRequest(request);

    // Fail closed BEFORE any Lead / User / Appointment writes.
    await verifyTurnstileToken({
      token: parsed.data.turnstileToken,
      remoteIp: clientIp,
      expectedAction: SELLER_READINESS_TURNSTILE_ACTION,
      allowedHostnames: SELLER_READINESS_TURNSTILE_ALLOWED_HOSTNAMES,
      requestHostname,
      errorMessage: SELLER_READINESS_TURNSTILE_ERROR_MESSAGE,
    });

    const email = normalizeProspectEmail(parsed.data.email);
    const fields = validateSellerReadinessFields({
      address: parsed.data.address,
      name: parsed.data.name,
      email,
      score: parsed.data.score,
    });
    if (!fields.ok) {
      return publicError(400, SELLER_READINESS_GENERIC_ERROR);
    }

    if (!allowSellerReadinessRequest({ clientIp, email })) {
      return publicError(429, SELLER_READINESS_RATE_LIMIT_ERROR);
    }

    const utm = pickUtm(parsed.data);
    const adCampaignId = await resolveAdCampaignId(utm);
    const resolved = await publicResolveOrCreateLead({
      request,
      intent: "SELLER",
      isBuyer: false,
      isSeller: true,
      source: "SELLER_READINESS",
      email,
      name: parsed.data.name.trim(),
      score: Math.min(70, 20 + Math.round(parsed.data.score / 2)),
      utm: utmLeadFields(utm, adCampaignId),
      notes: [
        `Seller readiness: ${parsed.data.address.trim()}`,
        `Score ${parsed.data.score}/100`,
        `Contact: ${parsed.data.name.trim()} <${email}>`,
      ].join("\n"),
      activity: {
        type: "seller_readiness",
        body: `${parsed.data.score}/100 · ${parsed.data.address.trim()}`,
        meta: { checks: parsed.data.checks, email },
      },
    });

    const { lead, assignedAgentId, organizationId, created } = resolved;

    // New leads only — block appointment/task spam on duplicate submits.
    if (created) {
      await prisma.appointment.create({
        data: {
          type: "VALUATION_CALL",
          status: "REQUESTED",
          agentId: assignedAgentId,
          leadId: lead.id,
          notes: `Seller readiness follow-up (${parsed.data.score}/100)`,
        },
      });

      if (assignedAgentId && organizationId) {
        await createCallNewLeadTask({
          leadId: lead.id,
          assigneeId: assignedAgentId,
          organizationId,
        });
      }
    }

    return publicOk();
  } catch (error) {
    if (error instanceof BookDemoPublicError) {
      const message = error.code.startsWith("TURNSTILE_")
        ? SELLER_READINESS_TURNSTILE_ERROR_MESSAGE
        : SELLER_READINESS_GENERIC_ERROR;
      return publicError(error.status, message);
    }
    const routingError = publicLeadRoutingErrorResponse(error);
    if (routingError) {
      // Keep routing failures generic for this public tool.
      return publicError(400, SELLER_READINESS_GENERIC_ERROR);
    }
    console.error("[seller-readiness] unexpected error");
    return publicError(500, SELLER_READINESS_GENERIC_ERROR);
  }
}
