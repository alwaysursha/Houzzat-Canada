import type { LeadIntent, PurchaseTimeframe } from "@prisma/client";
import { createCallNewLeadTask, resolveLeadIntent } from "@/lib/agent/lead-intake";
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
  isBuyer?: boolean;
  isSeller?: boolean;
  homeAddress?: string | null;
  purchaseTimeframe?: PurchaseTimeframe | null;
  utmSource?: string | null;
  /**
   * Import-only. When set, CASL/contact consent is applied only if true
   * and the row is not opted out. Omit for manual Add Lead.
   */
  assertCommunicationConsent?: boolean;
  optedOut?: boolean;
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
  const homeAddress = input.homeAddress?.trim() || null;
  const utmSource = input.utmSource?.trim() || null;
  const isImport = input.assertCommunicationConsent !== undefined;
  const isBuyer = input.isBuyer ?? true;
  const isSeller = input.isSeller ?? false;
  const intent: LeadIntent = resolveLeadIntent({ isBuyer, isSeller });
  const optedOut = input.optedOut === true;
  const grantConsent = isImport
    ? Boolean(input.assertCommunicationConsent) && !optedOut
    : true;
  const consentAt = grantConsent ? new Date() : null;
  const stampClassification =
    input.isBuyer !== undefined || input.isSeller !== undefined;

  let customer = await prisma.user.findUnique({ where: { email } });
  if (!customer) {
    customer = await prisma.user.create({
      data: {
        email,
        name,
        phone,
        homeAddress,
        purchaseTimeframe: input.purchaseTimeframe ?? null,
        role: "BUYER",
        isBuyer,
        isSeller,
        emailAlertsEnabled: optedOut ? false : true,
        caslConsentAt: consentAt,
      },
    });
  } else {
    customer = await prisma.user.update({
      where: { id: customer.id },
      data: {
        name: customer.name || name,
        phone: customer.phone || phone,
        homeAddress: customer.homeAddress || homeAddress,
        purchaseTimeframe:
          customer.purchaseTimeframe || input.purchaseTimeframe || undefined,
        ...(stampClassification ? { isBuyer, isSeller } : {}),
        ...(optedOut ? { emailAlertsEnabled: false } : {}),
        ...(grantConsent && !customer.caslConsentAt
          ? { caslConsentAt: consentAt }
          : {}),
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
      intent,
      score: 10,
      notes,
      utmSource,
      customerId: customer.id,
      assignedAgentId: input.agentId,
      organizationId: ownership.organizationId ?? input.organizationId,
      workspaceId: ownership.workspaceId,
      contactConsentAt: consentAt,
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

  return { leadId: lead.id, customerId: customer.id, email, intent };
}
