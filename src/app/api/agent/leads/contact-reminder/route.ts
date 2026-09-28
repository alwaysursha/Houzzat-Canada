import { NextResponse } from "next/server";
import { z } from "zod";
import { canAccessLead, requireAgentContextFromRequest } from "@/lib/agent";
import { requestCustomerContactUpdate } from "@/lib/agent/contact-update-request";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  leadId: z.string().min(1),
  channel: z.enum(["email", "phone"]),
});

export async function POST(request: Request) {
  const ctx = await requireAgentContextFromRequest(request);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: parsed.data.leadId },
    select: {
      id: true,
      organizationId: true,
      workspaceId: true,
      assignedAgentId: true,
      customerId: true,
    },
  });

  if (!lead || !canAccessLead(ctx, lead) || !lead.customerId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const requested = await requestCustomerContactUpdate({
    leadId: lead.id,
    customerId: lead.customerId,
    actorUserId: ctx.user.id,
    channel: parsed.data.channel,
  });

  return NextResponse.json(requested);
}
