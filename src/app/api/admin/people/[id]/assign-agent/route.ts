import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  resolveDefaultOrganizationId,
  resolveOrganizationIdForAssignee,
} from "@/lib/agent";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const schema = z.object({
  assigneeId: z.string().min(1).nullable(),
});

/**
 * Assign CRM leads for this person to an agent (or Pond).
 * If they only signed up and have no Lead yet, create one first.
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

  const organizationId =
    (await resolveOrganizationIdForAssignee(parsed.data.assigneeId)) ??
    (await resolveDefaultOrganizationId());

  let createdLead = false;
  if (!leads.length) {
    const created = await prisma.lead.create({
      data: {
        source: "OTHER",
        status: "NEW_LEAD",
        score: 10,
        customerId,
        assignedAgentId: parsed.data.assigneeId,
        organizationId: organizationId ?? undefined,
        contactConsentAt: new Date(),
        notes: [
          `Contact: ${customer.name || "Customer"} <${customer.email}>`,
          customer.phone ? `Phone: ${customer.phone}` : null,
          "Lead created from People admin assignment",
        ]
          .filter(Boolean)
          .join("\n"),
        activities: {
          create: {
            type: "created",
            userId: session.user.id,
            body: parsed.data.assigneeId
              ? "Created and assigned by admin from People"
              : "Created in pond by admin from People",
          },
        },
      },
      select: { id: true },
    });
    leads = [created];
    createdLead = true;
  } else {
    await prisma.$transaction(
      leads.map((lead) =>
        prisma.lead.update({
          where: { id: lead.id },
          data: {
            assignedAgentId: parsed.data.assigneeId,
            ...(organizationId ? { organizationId } : {}),
            activities: {
              create: {
                type: "reassigned",
                userId: session.user.id,
                body: parsed.data.assigneeId
                  ? `Assigned by admin to agent ${parsed.data.assigneeId}`
                  : "Moved to pond by admin",
              },
            },
          },
        }),
      ),
    );
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
