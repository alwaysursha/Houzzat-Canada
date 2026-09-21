import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAdCampaignId, utmLeadFields } from "@/lib/ads/attribution";
import { pickUtm } from "@/lib/ads/utm";
import {
  publicLeadRoutingErrorResponse,
  publicResolveOrCreateLead,
} from "@/lib/agent/public-lead-api";
import { createCallNewLeadTask } from "@/lib/agent/lead-intake";

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
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid" }, { status: 400 });
    }
    const utm = pickUtm(parsed.data);
    const adCampaignId = await resolveAdCampaignId(utm);
    const resolved = await publicResolveOrCreateLead({
      request,
      intent: "BUYER",
      isBuyer: true,
      isSeller: false,
      source: "AFFORDABILITY",
      email: parsed.data.email,
      name: parsed.data.name,
      score: 30,
      utm: utmLeadFields(utm, adCampaignId),
      notes: [
        `Affordability lead: ${parsed.data.name} <${parsed.data.email}>`,
        `Illustrative max purchase ~$${parsed.data.maxPurchase.toLocaleString()}`,
        parsed.data.income
          ? `Income stated: $${parsed.data.income.toLocaleString()}`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
      activity: {
        type: "affordability_calc",
        body: `Max ~$${parsed.data.maxPurchase.toLocaleString()}`,
        meta: { email: parsed.data.email },
      },
    });

    const { lead, assignedAgentId, organizationId, created } = resolved;

    if (created && assignedAgentId && organizationId) {
      await createCallNewLeadTask({
        leadId: lead.id,
        assigneeId: assignedAgentId,
        organizationId,
      });
    }

    return NextResponse.json({ ok: true, leadId: lead.id });
  } catch (error) {
    const routingError = publicLeadRoutingErrorResponse(error);
    if (routingError) return routingError;
    throw error;
  }
}
