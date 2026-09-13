import { createCallNewLeadTask } from "@/lib/agent/lead-intake";
import { resolveLeadCrmOwnership } from "@/lib/crm-ownership";
import { prisma } from "@/lib/prisma";

export type ManualLeadInput = {
  name: string;
  email: string;
  phone?: string | null;
  notes?: string | null;
  organizationId: string;
  agentId: string;
  /**
   * Trusted hostname-resolved workspace (manual Add Lead / import).
   * Never taken from the client. When set, stamps Lead.workspaceId and
   * skips legacy org→Houzzat ownership mapping.
   */
  workspaceId?: string | null;
  /** Activity body on the lead timeline. */
  activityBody?: string;
};

/**
 * Upsert customer by email and create a NEW_LEAD assigned to the agent.
 * Same path as POST /api/agent/leads (single + bulk import).
 */
export async function createManualLead(input: ManualLeadInput) {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const phone = input.phone?.trim() || null;
  const notes = input.notes?.trim() || null;

  let customer = await prisma.user.findUnique({ where: { email } });
  if (!customer) {
    customer = await prisma.user.create({
      data: {
        email,
        name,
        phone,
        role: "BUYER",
        isBuyer: true,
        caslConsentAt: new Date(),
      },
    });
  } else {
    customer = await prisma.user.update({
      where: { id: customer.id },
      data: {
        name: customer.name || name,
        phone: customer.phone || phone,
      },
    });
  }

  const trustedWorkspaceId = input.workspaceId?.trim() || null;
  const ownership = trustedWorkspaceId
    ? {
        organizationId: input.organizationId,
        workspaceId: trustedWorkspaceId,
      }
    : await resolveLeadCrmOwnership(input.organizationId);

  const lead = await prisma.lead.create({
    data: {
      status: "NEW_LEAD",
      source: "OTHER",
      intent: "BUYER",
      score: 10,
      notes,
      customerId: customer.id,
      assignedAgentId: input.agentId,
      organizationId: ownership.organizationId ?? input.organizationId,
      workspaceId: ownership.workspaceId,
      contactConsentAt: new Date(),
      statusChangedAt: new Date(),
      activities: {
        create: {
          type: "created",
          userId: input.agentId,
          body: input.activityBody ?? "Manual lead created",
        },
      },
    },
  });

  await createCallNewLeadTask({
    leadId: lead.id,
    assigneeId: input.agentId,
    organizationId: input.organizationId,
    createdById: input.agentId,
  });

  return { leadId: lead.id, customerId: customer.id, email };
}

/** Open (non-closed) lead already on this desk for the email. */
export async function findOpenOrgLeadForEmail(
  organizationId: string,
  email: string,
) {
  const normalized = email.trim().toLowerCase();
  return prisma.lead.findFirst({
    where: {
      organizationId,
      status: { not: "PAST_CLIENT" },
      customer: { email: normalized },
    },
    select: { id: true },
  });
}
