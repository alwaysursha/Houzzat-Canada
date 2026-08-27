import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessLead, requireAgentContextFromRequest, requireAgentUser } from "@/lib/agent";
import { SITE_URL } from "@/lib/constants";
import { sendNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  partnerId: z.string(),
  leadId: z.string().optional(),
  customerName: z.string().optional(),
  customerEmail: z.string().email().optional(),
  listingMls: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

const leadAuthSelect = {
  id: true,
  organizationId: true,
  workspaceId: true,
  assignedAgentId: true,
  listingMls: true,
  notes: true,
} as const;

export async function GET() {
  const agent = await requireAgentUser();
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [partners, handoffs] = await Promise.all([
    prisma.referralPartner.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
    prisma.referralHandoff.findMany({
      where: { agentId: agent.id },
      include: { partner: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);
  return NextResponse.json({ partners, handoffs });
}

export async function POST(request: Request) {
  const ctx = await requireAgentContextFromRequest(request);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid handoff" }, { status: 400 });
  }

  const partner = await prisma.referralPartner.findFirst({
    where: { id: parsed.data.partnerId, active: true },
  });
  if (!partner) {
    return NextResponse.json({ error: "Partner not found" }, { status: 404 });
  }

  let customerName = parsed.data.customerName;
  let customerEmail = parsed.data.customerEmail;
  let listingMls = parsed.data.listingMls;
  let authorizedLeadId: string | undefined;

  if (parsed.data.leadId) {
    const lead = await prisma.lead.findUnique({
      where: { id: parsed.data.leadId },
      select: leadAuthSelect,
    });
    if (!lead || !canAccessLead(ctx, lead)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    authorizedLeadId = lead.id;
    listingMls = listingMls ?? lead.listingMls ?? undefined;
    if (lead.notes) {
      const emailMatch = lead.notes.match(/<([^>]+@[^>]+)>/);
      if (emailMatch && !customerEmail) customerEmail = emailMatch[1];
      const nameMatch = lead.notes.match(/Contact:\s*([^<\n]+)/);
      if (nameMatch && !customerName) customerName = nameMatch[1].trim();
    }
  }

  const handoff = await prisma.referralHandoff.create({
    data: {
      partnerId: partner.id,
      agentId: ctx.user.id,
      leadId: authorizedLeadId,
      customerName,
      customerEmail,
      listingMls,
      notes: parsed.data.notes,
      status: "SENT",
    },
  });

  const trackUrl = `${SITE_URL}/r/${handoff.token}`;
  const portalUrl = `${SITE_URL}/partners/portal/${partner.portalToken}`;

  void sendNotification({
    toEmail: partner.email,
    toPhone: partner.phone,
    subject: `Houzzat referral handoff — ${customerName ?? "client"}`,
    text: [
      `New referral from ${ctx.user.name ?? ctx.user.email}`,
      customerName ? `Client: ${customerName}` : null,
      customerEmail ? `Email: ${customerEmail}` : null,
      listingMls ? `Listing: ${listingMls}` : null,
      parsed.data.notes ? `Notes: ${parsed.data.notes}` : null,
      `Open handoff: ${trackUrl}`,
      `Partner portal: ${portalUrl}`,
    ]
      .filter(Boolean)
      .join("\n"),
    smsText: `Houzzat referral: ${customerName ?? "client"} — ${trackUrl}`,
    whatsappText: `Houzzat referral handoff for ${customerName ?? "a client"}. Open: ${trackUrl}`,
    preferWhatsApp: true,
  });

  if (authorizedLeadId) {
    await prisma.leadActivity.create({
      data: {
        leadId: authorizedLeadId,
        userId: ctx.user.id,
        type: "referral_handoff",
        body: `${partner.type} → ${partner.name}`,
        meta: { handoffId: handoff.id, partnerId: partner.id },
      },
    });
  }

  return NextResponse.json({
    ok: true,
    handoff,
    trackUrl,
    portalUrl,
  });
}
