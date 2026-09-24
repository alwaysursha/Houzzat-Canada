import { createHash } from "crypto";
import { SITE_URL } from "@/lib/constants";
import { sendAndLogClientEmail } from "@/lib/email/client-send";
import { renderShortlistEmail } from "@/lib/email/templates";
import {
  formatListPrice,
  formatListingAddressOneLine,
  formatListingBedsLabel,
} from "@/lib/listings/constants";
import { listingPath } from "@/lib/listings/listing-path";
import { toCard } from "@/lib/listings/provider";
import { sendPushToUser } from "@/lib/notifications/push";
import { prisma } from "@/lib/prisma";
import { resolveCanonicalPublicOrigin } from "@/lib/tenancy/canonical-public-origin";
import { ENV_PINNED_ORIGIN_DOC } from "@/lib/tenancy/env-pinned-origin";

export type SendShortlistEmailInput = {
  leadId: string;
  mlsNumbers: string[];
  subject?: string;
  note?: string;
  title?: string;
  actorUserId: string;
  actorEmail: string | null;
  actorName: string | null;
  actorOrganizationId: string | null;
  /** Caller must enforce lead visibility (web canAccessLead or mobile authorizeMobileLeadAccess). */
  verifyLeadAccess: (lead: {
    id: string;
    workspaceId: string | null;
    organizationId: string | null;
    assignedAgentId: string | null;
    contactConsentAt: Date | null;
    customerId: string | null;
  }) => boolean;
};

export type SendShortlistEmailSuccess = {
  ok: true;
  shareUrl: string;
  count: number;
  stubbed: boolean;
  leadId: string;
};

export type SendShortlistEmailFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

export type SendShortlistEmailResult =
  | SendShortlistEmailSuccess
  | SendShortlistEmailFailure;

function encodeSharePayload(input: {
  mls: string[];
  title: string;
  note?: string;
  by?: string;
}) {
  const json = JSON.stringify(input);
  return Buffer.from(json, "utf8").toString("base64url").replace(/=+$/, "");
}

/**
 * Customer-facing share/listing links must use the lead workspace's canonical
 * public consumer origin — never the HouzzatPRO CRM host (app.houzzatpro.com).
 */
async function resolveShortlistPublicOrigin(
  workspaceId: string | null,
): Promise<string> {
  if (workspaceId) {
    let fallbackHost = "houzzat.com";
    try {
      const siteHost = new URL(SITE_URL).hostname;
      // HouzzatPRO CRM host is not a consumer marketing origin for /share/homes.
      if (siteHost !== "app.houzzatpro.com") {
        fallbackHost = siteHost;
      }
    } catch {
      fallbackHost = "houzzat.com";
    }
    return resolveCanonicalPublicOrigin(workspaceId, fallbackHost);
  }
  return ENV_PINNED_ORIGIN_DOC.productionValueToday;
}

export async function sendShortlistEmail(
  input: SendShortlistEmailInput,
): Promise<SendShortlistEmailResult> {
  const lead = await prisma.lead.findUnique({
    where: { id: input.leadId },
    include: {
      customer: {
        select: {
          id: true,
          email: true,
          name: true,
          emailAlertsEnabled: true,
          caslConsentAt: true,
        },
      },
      assignedAgent: { select: { name: true, email: true } },
    },
  });

  if (!lead || !input.verifyLeadAccess(lead)) {
    return {
      ok: false,
      status: 404,
      code: "LEAD_NOT_FOUND",
      message: "Lead not found",
    };
  }

  const toEmail = lead.customer?.email;
  if (!toEmail) {
    return {
      ok: false,
      status: 400,
      code: "LEAD_NO_EMAIL",
      message: "Lead has no email",
    };
  }

  const consented =
    Boolean(lead.contactConsentAt) || Boolean(lead.customer?.caslConsentAt);
  if (!consented || lead.customer?.emailAlertsEnabled === false) {
    return {
      ok: false,
      status: 400,
      code: "CASL_BLOCKED",
      message: "No CASL consent or email alerts are off",
    };
  }

  const mlsNumbers = [...new Set(input.mlsNumbers.map((m) => m.trim()))];
  const listings = await prisma.listing.findMany({
    where: { mlsNumber: { in: mlsNumbers } },
    include: { media: true, openHouses: true },
  });
  const byMls = new Map(listings.map((l) => [l.mlsNumber, l]));
  const cards = mlsNumbers
    .map((mls) => byMls.get(mls))
    .filter(Boolean)
    .map((l) => toCard(l!));

  if (cards.length === 0) {
    return {
      ok: false,
      status: 404,
      code: "LISTINGS_NOT_FOUND",
      message: "No listings found",
    };
  }

  const title = input.title ?? "Homes selected for you";
  const note = input.note?.trim() || undefined;
  const agentName =
    lead.assignedAgent?.name ||
    input.actorName ||
    "your Houzzat agent";

  const token = encodeSharePayload({
    mls: cards.map((c) => c.mlsNumber),
    title,
    note,
    by: agentName,
  });
  const fingerprint = createHash("sha256")
    .update(token)
    .digest("hex")
    .slice(0, 10);

  const publicOrigin = (
    await resolveShortlistPublicOrigin(lead.workspaceId)
  ).replace(/\/$/, "");
  const shareUrl = `${publicOrigin}/share/homes/${token}`;

  const emailListings = cards.map((c) => {
    const baths = Number.isInteger(c.baths)
      ? String(c.baths)
      : c.baths.toFixed(1);
    return {
      mlsNumber: c.mlsNumber,
      addressLine: formatListingAddressOneLine(c),
      city: c.city,
      priceLabel: formatListPrice(c.listPrice, c.transactionType),
      listingUrl: `${publicOrigin}${listingPath(c)}`,
      bedsLabel: formatListingBedsLabel(c),
      bathsLabel: baths,
      sqftLabel: c.sqft ? `${c.sqft.toLocaleString("en-CA")} sqft` : null,
      imageUrl: c.primaryImageUrl,
    };
  });

  const rendered = renderShortlistEmail({
    name: lead.customer?.name,
    agentName,
    shareUrl,
    note,
    listings: emailListings,
  });
  if (input.subject?.trim()) {
    rendered.subject = input.subject.trim();
  }

  const result = await sendAndLogClientEmail({
    to: toEmail,
    rendered,
    stream: "notify",
    customerId: lead.customerId,
    leadId: lead.id,
    sentById: input.actorUserId,
    organizationId: lead.organizationId ?? input.actorOrganizationId,
    replyTo: input.actorEmail,
  });

  if (!result.ok) {
    return {
      ok: false,
      status: 502,
      code: "SEND_FAILED",
      message: "Send failed",
    };
  }

  if (lead.customerId) {
    void sendPushToUser(lead.customerId, {
      type: "shortlist",
      title: "Homes from your agent",
      body: `${cards.length} ${cards.length === 1 ? "home" : "homes"} to review`,
      href: shareUrl.replace(publicOrigin, "") || "/account",
    });
  }

  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      userId: input.actorUserId,
      type: "shortlist_emailed",
      body: `Emailed shortlist (${cards.length} homes · ${fingerprint}) · ${shareUrl}`,
    },
  });

  return {
    ok: true,
    shareUrl,
    count: cards.length,
    stubbed: result.status === "skipped",
    leadId: lead.id,
  };
}
