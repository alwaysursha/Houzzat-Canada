import type { PurchaseTimeframe } from "@prisma/client";
import { finalizeWritableLeadClassification } from "@/lib/agent/lead-classification";
import { createCallNewLeadTask } from "@/lib/agent/lead-intake";
import { resolveOrCreateWorkspaceLead } from "@/lib/agent/resolve-workspace-lead";
import { resolveLeadCrmOwnership } from "@/lib/crm-ownership";
import { prisma } from "@/lib/prisma";
import { scheduleCustomerIntroductionSmsAutomationsForLead } from "@/lib/sms/automations";
import {
  InvalidContactPhoneError,
  parsePhoneColumnsForWrite,
} from "@/lib/sms/e164";

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
 * Upsert customer by email and resolve-or-create a workspace Lead.
 * Existing identity is reused (sticky assignee). Same path as POST /api/agent/leads.
 *
 * CRM classification is written to the Lead only. User.isBuyer / User.isSeller
 * stay Houzzat consumer/account flags and are never mutated here.
 */
export async function createManualLead(input: ManualLeadInput) {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const phone = input.phone?.trim() || null;
  const notes = input.notes?.trim() || null;
  const homeAddress = input.homeAddress?.trim() || null;
  const utmSource = input.utmSource?.trim() || null;
  const isImport = input.assertCommunicationConsent !== undefined;
  const classification = finalizeWritableLeadClassification({
    isBuyer: input.isBuyer ?? true,
    isSeller: input.isSeller ?? false,
  });
  const optedOut = input.optedOut === true;
  const grantConsent = isImport
    ? Boolean(input.assertCommunicationConsent) && !optedOut
    : true;
  const consentAt = grantConsent ? new Date() : null;

  let customer = await prisma.user.findFirst({
    where: input.workspaceId
      ? { email, workspaceId: input.workspaceId }
      : { email, workspaceId: null },
  });
  if (!customer) {
    const parsedPhone = parsePhoneColumnsForWrite(phone);
    if (!parsedPhone.ok) throw new InvalidContactPhoneError(parsedPhone.error);
    customer = await prisma.user.create({
      data: {
        email,
        workspaceId: input.workspaceId ?? undefined,
        name,
        ...parsedPhone.columns,
        homeAddress,
        purchaseTimeframe: input.purchaseTimeframe ?? null,
        role: "BUYER",
        emailAlertsEnabled: optedOut ? false : true,
        caslConsentAt: consentAt,
      },
    });
  } else {
    const parsedPhone =
      customer.phone || !phone
        ? null
        : parsePhoneColumnsForWrite(phone);
    if (parsedPhone && !parsedPhone.ok) {
      throw new InvalidContactPhoneError(parsedPhone.error);
    }
    customer = await prisma.user.update({
      where: { id: customer.id },
      data: {
        name: customer.name || name,
        ...(parsedPhone ? parsedPhone.columns : {}),
        homeAddress: customer.homeAddress || homeAddress,
        purchaseTimeframe:
          customer.purchaseTimeframe || input.purchaseTimeframe || undefined,
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

  if (!ownership.workspaceId) {
    throw new Error("Workspace required.");
  }

  const resolved = await resolveOrCreateWorkspaceLead({
    workspaceId: ownership.workspaceId,
    organizationId: ownership.organizationId ?? input.organizationId,
    customerId: customer.id,
    email,
    phone,
    name,
    isBuyer: classification.isBuyer,
    isSeller: classification.isSeller,
    source: "OTHER",
    notes,
    score: 10,
    contactConsentAt: consentAt,
    actorId: input.agentId,
    upsertCustomer: false,
    utm: utmSource ? { utmSource } : undefined,
    activity: {
      type: "created",
      userId: input.agentId,
      body: input.activityBody ?? "Manual lead created",
    },
    resolveCreateDesk: async () => ({
      assigneeId: input.agentId,
      organizationId: ownership.organizationId ?? input.organizationId,
    }),
  });

  if (resolved.created) {
    await createCallNewLeadTask({
      leadId: resolved.lead.id,
      assigneeId: input.agentId,
      organizationId: input.organizationId,
      createdById: input.agentId,
    });
    scheduleCustomerIntroductionSmsAutomationsForLead(resolved.lead.id);
  }

  return {
    leadId: resolved.lead.id,
    customerId: customer.id,
    email,
    intent: resolved.lead.intent,
    created: resolved.created,
  };
}
