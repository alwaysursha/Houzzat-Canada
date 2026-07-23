import { NextResponse } from "next/server";
import { z } from "zod";
import type { LeadStatus } from "@prisma/client";
import { canManageAllLeads, requireAgentUser } from "@/lib/agent";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  leadId: z.string().min(1),
  status: z
    .enum([
      "NEW",
      "CONTACTED",
      "QUALIFIED",
      "ACTIVE_BUYER",
      "ACTIVE_SELLER",
      "SHOWING",
      "OFFER",
      "CLIENT",
      "NURTURE",
      "LOST",
    ])
    .optional(),
  claim: z.boolean().optional(),
  notes: z.string().max(5000).optional(),
});

export async function PATCH(request: Request) {
  const agent = await requireAgentUser();
  if (!agent) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({
    where: { id: parsed.data.leadId },
  });
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (
    !canManageAllLeads(agent.role) &&
    lead.assignedAgentId &&
    lead.assignedAgentId !== agent.id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data: {
    status?: LeadStatus;
    assignedAgentId?: string;
    notes?: string;
  } = {};

  if (parsed.data.status) data.status = parsed.data.status;
  if (parsed.data.claim) data.assignedAgentId = agent.id;
  if (parsed.data.notes != null) data.notes = parsed.data.notes;

  const updated = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      ...data,
      activities: {
        create: {
          type: parsed.data.claim
            ? "claimed"
            : parsed.data.status
              ? "status_change"
              : "note",
          userId: agent.id,
          body: parsed.data.notes ?? parsed.data.status ?? "updated",
          meta: {
            status: parsed.data.status,
            claim: parsed.data.claim,
          },
        },
      },
    },
  });

  return NextResponse.json({ ok: true, lead: updated });
}
