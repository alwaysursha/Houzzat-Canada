import { NextResponse } from "next/server";
import { z } from "zod";
import {
  canAccessLead,
  markLeadFirstResponse,
  requireAgentContext,
} from "@/lib/agent";
import { sendNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

const singleSchema = z.object({
  mode: z.literal("single").default("single"),
  leadId: z.string().min(1),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
});

const massSchema = z.object({
  mode: z.literal("mass"),
  leadIds: z.array(z.string().min(1)).min(1).max(50),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
});

const schema = z.union([singleSchema, massSchema]);

export async function POST(request: Request) {
  const ctx = await requireAgentContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const leadIds =
    parsed.data.mode === "mass"
      ? parsed.data.leadIds
      : [parsed.data.leadId];

  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds } },
    include: {
      customer: {
        select: {
          email: true,
          name: true,
          emailAlertsEnabled: true,
          caslConsentAt: true,
        },
      },
    },
  });

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const lead of leads) {
    if (!canAccessLead(ctx, lead)) {
      skipped += 1;
      continue;
    }

    const toEmail = lead.customer?.email;
    if (!toEmail) {
      skipped += 1;
      errors.push(`${lead.id}: no customer email`);
      continue;
    }

    const consented =
      Boolean(lead.contactConsentAt) ||
      Boolean(lead.customer?.caslConsentAt);
    if (!consented || lead.customer?.emailAlertsEnabled === false) {
      skipped += 1;
      errors.push(`${toEmail}: no CASL consent / alerts off`);
      continue;
    }

    const result = await sendNotification({
      toEmail,
      subject: parsed.data.subject,
      text: parsed.data.body,
    });

    if (result.email === "failed") {
      errors.push(`${toEmail}: send failed`);
      continue;
    }

    const orgId = lead.organizationId ?? ctx.organizationId;
    await prisma.leadEmailLog.create({
      data: {
        organizationId: orgId,
        leadId: lead.id,
        sentById: ctx.user.id,
        toEmail,
        subject: parsed.data.subject,
        body: parsed.data.body,
      },
    });
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: ctx.user.id,
        type: "email_sent",
        body: parsed.data.subject,
      },
    });
    await markLeadFirstResponse(lead.id, ctx.user.id);
    sent += 1;
  }

  return NextResponse.json({ ok: true, sent, skipped, errors });
}
