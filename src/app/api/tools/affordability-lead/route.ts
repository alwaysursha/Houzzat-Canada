import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAdCampaignId, utmLeadFields } from "@/lib/ads/attribution";
import { pickUtm } from "@/lib/ads/utm";
import { pickAssigneeAgentId } from "@/lib/agent";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  maxPurchase: z.number().positive(),
  income: z.number().positive().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmContent: z.string().optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  }
  const utm = pickUtm(parsed.data);
  const adCampaignId = await resolveAdCampaignId(utm);
  const assigneeId = await pickAssigneeAgentId();

  const lead = await prisma.lead.create({
    data: {
      source: "AFFORDABILITY",
      status: "NEW",
      score: 30,
      assignedAgentId: assigneeId,
      ...utmLeadFields(utm, adCampaignId),
      notes: [
        `Affordability lead: ${parsed.data.name} <${parsed.data.email}>`,
        `Illustrative max purchase ~$${parsed.data.maxPurchase.toLocaleString()}`,
        parsed.data.income
          ? `Income stated: $${parsed.data.income.toLocaleString()}`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
      activities: {
        create: {
          type: "affordability_calc",
          body: `Max ~$${parsed.data.maxPurchase.toLocaleString()}`,
          meta: { email: parsed.data.email },
        },
      },
    },
  });

  return NextResponse.json({ ok: true, leadId: lead.id });
}
