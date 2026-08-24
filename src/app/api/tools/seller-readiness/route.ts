import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAdCampaignId, utmLeadFields } from "@/lib/ads/attribution";
import { pickUtm } from "@/lib/ads/utm";
import { resolvePublicLeadDesk } from "@/lib/agent";
import { resolveLeadCrmOwnership } from "@/lib/crm-ownership";
import {
  createCallNewLeadTask,
  resolveLeadDeskAssignment,
} from "@/lib/agent/lead-intake";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  address: z.string().min(3),
  name: z.string().min(1),
  email: z.string().email(),
  score: z.number().min(0).max(100),
  checks: z.record(z.string(), z.boolean()).optional(),
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
  const desk = await resolvePublicLeadDesk();
  const routed = await resolveLeadDeskAssignment("SELLER");
  const organizationId = routed.organizationId ?? desk.organizationId;
  const assignedAgentId = routed.assigneeId;

  const lead = await prisma.lead.create({
    data: {
      source: "SELLER_READINESS",
      status: "NEW_LEAD",
      intent: "SELLER",
      score: Math.min(70, 20 + Math.round(parsed.data.score / 2)),
      assignedAgentId,
      ...(await resolveLeadCrmOwnership(organizationId)),
      ...utmLeadFields(utm, adCampaignId),
      notes: [
        `Seller readiness: ${parsed.data.address}`,
        `Score ${parsed.data.score}/100`,
        `Contact: ${parsed.data.name} <${parsed.data.email}>`,
      ].join("\n"),
      activities: {
        create: {
          type: "seller_readiness",
          body: `${parsed.data.score}/100 · ${parsed.data.address}`,
          meta: { checks: parsed.data.checks, email: parsed.data.email },
        },
      },
      appointments: {
        create: {
          type: "VALUATION_CALL",
          status: "REQUESTED",
          agentId: assignedAgentId,
          notes: `Seller readiness follow-up (${parsed.data.score}/100)`,
        },
      },
    },
  });

  if (assignedAgentId && organizationId) {
    await createCallNewLeadTask({
      leadId: lead.id,
      assigneeId: assignedAgentId,
      organizationId,
    });
  }

  return NextResponse.json({ ok: true, leadId: lead.id });
}
