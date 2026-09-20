import type { AgentOrgContext } from "@/lib/agent";
import {
  AGENT_SMS_TEXT_MAX_LENGTH,
  evaluateAgentSmsEligibility,
} from "@/lib/conversations/agent-conversation-sms";
import { frozenAgentSenderName } from "@/lib/conversations/agent-conversation-send";
import { isE164, resolveCommunicationsE164 } from "@/lib/sms/e164";
import { isPhoneSuppressed, type SmsSuppressionDb } from "@/lib/sms/suppression";
import {
  SMS_MASS_EXCLUDE_REASONS,
  type SmsMassExcludeReason,
} from "./constants";
import {
  firstNameFromLeadName,
  renderSmsQuickText,
  type SmsQuickTextRenderContext,
} from "@/lib/sms/quick-texts/render";

export type MassSmsLeadRow = {
  id: string;
  workspaceId: string | null;
  assignedAgentId: string | null;
  customer: { phoneE164: string | null; phone: string | null; name: string | null } | null;
  workspace: {
    name: string;
    twilioPhoneE164: string | null;
    twilioSubaccountSid: string | null;
    twilioMessagingServiceSid: string | null;
  } | null;
};

export type MassSmsRecipientDecision = {
  leadId: string;
  eligible: boolean;
  reason: SmsMassExcludeReason | null;
  toE164: string | null;
  fromE164: string | null;
  context: SmsQuickTextRenderContext;
  renderedBody: string;
};

export function smsMassExcludeCopy(reason: SmsMassExcludeReason): string {
  switch (reason) {
    case "NOT_FOUND":
      return "Lead not found";
    case "CROSS_TENANT":
      return "Not in this workspace";
    case "NOT_ASSIGNED":
      return "Not assigned to you";
    case "NO_CUSTOMER_E164":
      return "No valid mobile number";
    case "NO_WORKSPACE_NUMBER":
      return "Workspace SMS is not configured";
    case "SUPPRESSED":
      return "Opted out of SMS";
    case "INVALID_BODY":
      return "Message could not be rendered";
  }
}

export function summarizeSmsMassExclusions(
  decisions: MassSmsRecipientDecision[],
): Array<{ reason: SmsMassExcludeReason; count: number; label: string }> {
  const counts = new Map<SmsMassExcludeReason, number>();
  for (const row of decisions) {
    if (row.eligible || !row.reason) continue;
    counts.set(row.reason, (counts.get(row.reason) ?? 0) + 1);
  }
  return SMS_MASS_EXCLUDE_REASONS.filter((reason) => counts.has(reason)).map(
    (reason) => ({
      reason,
      count: counts.get(reason) ?? 0,
      label: smsMassExcludeCopy(reason),
    }),
  );
}

export function massSmsRenderContext(
  ctx: AgentOrgContext,
  lead: MassSmsLeadRow,
): SmsQuickTextRenderContext {
  const leadName = lead.customer?.name ?? "";
  return {
    leadName,
    firstName: firstNameFromLeadName(leadName),
    agentName: frozenAgentSenderName(ctx.user),
    workspaceName: lead.workspace?.name ?? "",
    propertyAddress: "",
  };
}

export async function classifyMassSmsLead(input: {
  ctx: AgentOrgContext;
  lead: MassSmsLeadRow | null;
  requestedId: string;
  body: string;
  suppressed: boolean;
}): Promise<MassSmsRecipientDecision> {
  const leadId = input.requestedId;
  if (!input.lead) {
    return {
      leadId,
      eligible: false,
      reason: "NOT_FOUND",
      toE164: null,
      fromE164: null,
      context: {},
      renderedBody: "",
    };
  }
  if (
    !input.ctx.workspaceId ||
    !input.lead.workspaceId ||
    input.lead.workspaceId !== input.ctx.workspaceId
  ) {
    return {
      leadId,
      eligible: false,
      reason: "CROSS_TENANT",
      toE164: null,
      fromE164: null,
      context: {},
      renderedBody: "",
    };
  }

  const context = massSmsRenderContext(input.ctx, input.lead);
  const renderedBody = renderSmsQuickText(input.body, context);
  const eligibility = evaluateAgentSmsEligibility({
    viewerUserId: input.ctx.user.id,
    assignedAgentId: input.lead.assignedAgentId,
    toE164: resolveCommunicationsE164(
      input.lead.customer?.phone,
      input.lead.customer?.phoneE164,
    ),
    fromE164: input.lead.workspace?.twilioPhoneE164 ?? null,
    twilioSubaccountSid: input.lead.workspace?.twilioSubaccountSid ?? null,
    twilioMessagingServiceSid:
      input.lead.workspace?.twilioMessagingServiceSid ?? null,
    suppressed: input.suppressed,
  });

  if (!eligibility.enabled) {
    const reason: SmsMassExcludeReason =
      eligibility.reason === "NOT_ASSIGNED" ||
      eligibility.reason === "NO_CUSTOMER_E164" ||
      eligibility.reason === "NO_WORKSPACE_NUMBER" ||
      eligibility.reason === "SUPPRESSED"
        ? eligibility.reason
        : "NOT_ASSIGNED";
    return {
      leadId,
      eligible: false,
      reason,
      toE164: eligibility.toE164,
      fromE164: eligibility.fromE164,
      context,
      renderedBody,
    };
  }
  if (!renderedBody || renderedBody.length > AGENT_SMS_TEXT_MAX_LENGTH) {
    return {
      leadId,
      eligible: false,
      reason: "INVALID_BODY",
      toE164: eligibility.toE164,
      fromE164: eligibility.fromE164,
      context,
      renderedBody: "",
    };
  }
  return {
    leadId,
    eligible: true,
    reason: null,
    toE164: eligibility.toE164,
    fromE164: eligibility.fromE164,
    context,
    renderedBody,
  };
}

export async function classifyMassSmsLeads(input: {
  ctx: AgentOrgContext;
  leads: MassSmsLeadRow[];
  requestedIds: string[];
  body: string;
  db: SmsSuppressionDb;
  isPhoneSuppressed?: typeof isPhoneSuppressed;
}): Promise<MassSmsRecipientDecision[]> {
  const byId = new Map(input.leads.map((row) => [row.id, row]));
  const check = input.isPhoneSuppressed ?? isPhoneSuppressed;
  const decisions: MassSmsRecipientDecision[] = [];
  for (const id of input.requestedIds) {
    const lead = byId.get(id) ?? null;
    const to = resolveCommunicationsE164(
      lead?.customer?.phone,
      lead?.customer?.phoneE164,
    );
    const suppressed =
      Boolean(input.ctx.workspaceId) && isE164(to)
        ? await check(input.ctx.workspaceId, to, input.db)
        : false;
    decisions.push(
      await classifyMassSmsLead({
        ctx: input.ctx,
        lead,
        requestedId: id,
        body: input.body,
        suppressed,
      }),
    );
  }
  return decisions;
}
