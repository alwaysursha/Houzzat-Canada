import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  canAccessLead,
  markLeadFirstResponse,
  requireAgentContext,
} from "@/lib/agent";
import { SITE_URL } from "@/lib/constants";
import {
  formatListPrice,
  formatListingAddressOneLine,
  formatListingBedsLabel,
} from "@/lib/listings/constants";
import { listingPath } from "@/lib/listings/listing-path";
import { toCard } from "@/lib/listings/provider";
import { sendNotification } from "@/lib/notifications";
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
  const firstName =
    lead.customer?.name?.trim().split(/\s+/)[0] || "there";

  const listingLines = cards.map((c, i) => {
    const addr = formatListingAddressOneLine(c);
    const price = formatListPrice(c.listPrice, c.transactionType);
    return `${i + 1}. ${addr} — ${price} (${formatListingBedsLabel(c)} bed · MLS ${c.mlsNumber})\n   ${SITE_URL}${listingPath(c)}`;
  });

  const noteBlock = note ? `\n${note}\n` : "";
  const subject =
    parsed.data.subject ??
    `${cards.length} home${cards.length === 1 ? "" : "s"} for you`;

  const body = `Hi ${firstName},

I put together a shortlist of ${cards.length} home${cards.length === 1 ? "" : "s"} that match what you've been looking at.
${noteBlock}
View all of them here:
${shareUrl}

${listingLines.join("\n\n")}

Happy to book showings or refine the search anytime.

— ${agentName}
Houzzat`;

  const result = await sendNotification({
    toEmail,
    subject,
    text: body,
  });

  if (result.email === "failed") {
    return NextResponse.json({ error: "Send failed" }, { status: 502 });
  }

  const orgId = lead.organizationId ?? ctx.organizationId;
  await prisma.leadEmailLog.create({
    data: {
      organizationId: orgId,
      leadId: lead.id,
      sentById: ctx.user.id,
      toEmail,
      subject,
      body,
    },
  });
  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      userId: ctx.user.id,
      type: "shortlist_emailed",
      body: `Emailed shortlist (${cards.length} homes · ${fingerprint}) · ${shareUrl}`,
    },
  });
  await markLeadFirstResponse(lead.id, ctx.user.id);

  return NextResponse.json({
    ok: true,
    shareUrl,
    count: cards.length,
    stubbed: result.email === "skipped",
  });
}
