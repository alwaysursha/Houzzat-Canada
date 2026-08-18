import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessLead, requireAgentContext } from "@/lib/agent";
import { SITE_URL } from "@/lib/constants";
import { sendAndLogClientEmail } from "@/lib/email/client-send";
import { sendPushToUser } from "@/lib/notifications/push";
import { renderShortlistEmail } from "@/lib/email/templates";
import {
  formatListPrice,
  formatListingAddressOneLine,
  formatListingBedsLabel,
} from "@/lib/listings/constants";
import { listingPath } from "@/lib/listings/listing-path";
import { toCard } from "@/lib/listings/provider";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  leadId: z.string().min(1),
  mlsNumbers: z.array(z.string().min(3).max(32)).min(1).max(24),
  subject: z.string().min(1).max(200).optional(),
  note: z.string().max(2000).optional(),
  title: z.string().min(1).max(120).optional(),
});

function encodeSharePayload(input: {
  mls: string[];
  title: string;
  note?: string;
  by?: string;
}) {
  const json = JSON.stringify(input);
  return Buffer.from(json, "utf8")
    .toString("base64url")
    .replace(/=+$/, "");
}

export async function POST(request: Request) {
  const ctx = await requireAgentContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: parsed.data.leadId },
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

  if (!lead || !canAccessLead(ctx, lead)) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const toEmail = lead.customer?.email;
  if (!toEmail) {
    return NextResponse.json({ error: "Lead has no email" }, { status: 400 });
  }

  const consented =
    Boolean(lead.contactConsentAt) || Boolean(lead.customer?.caslConsentAt);
  if (!consented || lead.customer?.emailAlertsEnabled === false) {
    return NextResponse.json(
      { error: "No CASL consent or email alerts are off" },
      { status: 400 },
    );
  }

  const mlsNumbers = [...new Set(parsed.data.mlsNumbers.map((m) => m.trim()))];
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
    return NextResponse.json({ error: "No listings found" }, { status: 404 });
  }

  const title = parsed.data.title ?? "Homes selected for you";
  const note = parsed.data.note?.trim() || undefined;
  const agentName =
    lead.assignedAgent?.name ||
    ctx.user.name ||
    "your Houzzat agent";

  const token = encodeSharePayload({
    mls: cards.map((c) => c.mlsNumber),
    title,
    note,
    by: agentName,
  });
  // Soft fingerprint so we can log a stable id without a DB table
  const fingerprint = createHash("sha256")
    .update(token)
    .digest("hex")
    .slice(0, 10);

  const shareUrl = `${SITE_URL}/share/homes/${token}`;

  const emailListings = cards.map((c) => {
    const baths = Number.isInteger(c.baths)
      ? String(c.baths)
      : c.baths.toFixed(1);
    return {
      mlsNumber: c.mlsNumber,
      addressLine: formatListingAddressOneLine(c),
      city: c.city,
      priceLabel: formatListPrice(c.listPrice, c.transactionType),
      listingUrl: `${SITE_URL}${listingPath(c)}`,
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
  if (parsed.data.subject?.trim()) {
    rendered.subject = parsed.data.subject.trim();
  }

  const result = await sendAndLogClientEmail({
    to: toEmail,
    rendered,
    stream: "notify",
    customerId: lead.customerId,
    leadId: lead.id,
    sentById: ctx.user.id,
    organizationId: lead.organizationId ?? ctx.organizationId,
    replyTo: ctx.user.email,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "Send failed" }, { status: 502 });
  }

  if (lead.customerId) {
    void sendPushToUser(lead.customerId, {
      type: "shortlist",
      title: "Homes from your agent",
      body: `${cards.length} ${cards.length === 1 ? "home" : "homes"} to review`,
      href: shareUrl.replace(SITE_URL, "") || "/account",
    });
  }

  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      userId: ctx.user.id,
      type: "shortlist_emailed",
      body: `Emailed shortlist (${cards.length} homes · ${fingerprint}) · ${shareUrl}`,
    },
  });

  return NextResponse.json({
    ok: true,
    shareUrl,
    count: cards.length,
    stubbed: result.status === "skipped",
  });
}
