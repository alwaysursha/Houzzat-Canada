import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  applyLeadAssignment,
  captureWebsiteLead,
  resolveLeadIntent,
} from "@/lib/agent/lead-intake";
import { isAmbiguousLeadIdentityError } from "@/lib/agent/lead-identity";
import { auth } from "@/lib/auth";
import { notifyLeadAssignedToAgent } from "@/lib/notifications/staff-events";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const schema = z.object({
  assigneeId: z.string().min(1).nullable(),
});

/**
 * Assign CRM leads for this person to an agent (or Pond).
 * If they only signed up and have no Lead yet, create one first.
 * Creates a 12h "Call new lead" task on assign.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: customerId } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const customer = await prisma.user.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      isBuyer: true,
      isSeller: true,
    },
  });
  if (!customer) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }

  if (parsed.data.assigneeId) {
    const agent = await prisma.user.findFirst({
      where: {
        id: parsed.data.assigneeId,
        role: { in: ["AGENT", "ADMIN"] },
        disabledAt: null,
      },
      select: { id: true },
    });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
  }

  let leads = await prisma.lead.findMany({
    where: { customerId },
    select: { id: true },
  });

  let createdLead = false;
  if (!leads.length) {
    try {
      const captured = await captureWebsiteLead({
        source: "OTHER",
        customerId,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        isBuyer: customer.isBuyer,
        isSeller: customer.isSeller,
        intent: resolveLeadIntent(customer),
        score: 10,
        actorId: session.user.id,
        forceAssigneeId: parsed.data.assigneeId,
        request,
        notes: [
          `Contact: ${customer.name || "Customer"} <${customer.email}>`,
          customer.phone ? `Phone: ${customer.phone}` : null,
          "Lead created from People admin assignment",
        ]
          .filter(Boolean)
          .join("\n"),
      });
      leads = [{ id: captured.lead.id }];
      createdLead = captured.created;
      if (!captured.created) {
        await applyLeadAssignment({
          leadId: captured.lead.id,
          assigneeId: parsed.data.assigneeId,
          actorId: session.user.id,
          activityBody: parsed.data.assigneeId
            ? `Assigned by admin to agent ${parsed.data.assigneeId}`
            : "Moved to pond by admin",
        });
      }
    } catch (error) {
      if (isAmbiguousLeadIdentityError(error)) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      throw error;
    }
  } else {
    for (const lead of leads) {
      await applyLeadAssignment({
        leadId: lead.id,
        assigneeId: parsed.data.assigneeId,
        actorId: session.user.id,
        activityBody: parsed.data.assigneeId
          ? `Assigned by admin to agent ${parsed.data.assigneeId}`
          : "Moved to pond by admin",
      });
    }
  }

  if (parsed.data.assigneeId && parsed.data.assigneeId !== session.user.id && !createdLead) {
    const firstLeadId = leads[0]?.id;
    if (firstLeadId) {
      notifyLeadAssignedToAgent(parsed.data.assigneeId, {
        leadId: firstLeadId,
        label:
          leads.length > 1
            ? `${customer.name || customer.email}: ${leads.length} leads`
            : customer.name || customer.email,
      });
    }
  }

  await writeAuditLog({
    actorId: session.user.id,
    action: "lead.assign",
    entityType: "User",
    entityId: customerId,
    summary: createdLead
      ? parsed.data.assigneeId
        ? `Created + assigned lead for ${customer.email}`
        : `Created pond lead for ${customer.email}`
      : parsed.data.assigneeId
        ? `Assigned ${leads.length} lead(s) for ${customer.email}`
        : `Moved ${leads.length} lead(s) for ${customer.email} to pond`,
    meta: {
      assigneeId: parsed.data.assigneeId,
      leadIds: leads.map((l) => l.id),
      count: leads.length,
      createdLead,
    },
  });

  return NextResponse.json({
    ok: true,
    updated: leads.length,
    createdLead,
    assigneeId: parsed.data.assigneeId,
  });
}
