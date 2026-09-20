import type { PrismaClient } from "@prisma/client";
import { frozenAgentSenderName } from "@/lib/conversations/agent-conversation-send";
import {
  firstNameFromLeadName,
  listActiveSmsQuickTexts,
  prismaSmsQuickTextDb,
  renderSmsQuickText,
  serializeSmsQuickText,
  type SmsQuickTextDb,
} from "@/lib/platform/sms-quick-texts";
import type { SmsQuickTextRenderContext } from "@/lib/sms/quick-texts/render";
import type { AgentOrgContext } from "@/lib/agent";

export type AgentSmsQuickTextView = {
  id: string;
  key: string;
  name: string;
  category: string;
  body: string;
  rendered: string;
};

type QuickTextLeadDb = {
  lead: {
    findUnique: (args: {
      where: { workspaceId_id: { workspaceId: string; id: string } } | { id: string };
      select: {
        customer: { select: { name: true } };
        workspace: { select: { name: true } };
      };
    }) => Promise<{
      customer: { name: string | null } | null;
      workspace: { name: string } | null;
    } | null>;
  };
};

export function smsQuickTextContextFromLead(input: {
  leadName: string | null;
  agentName: string | null;
  workspaceName: string | null;
  propertyAddress: string | null;
}): SmsQuickTextRenderContext {
  const leadName = input.leadName?.trim() || "";
  return {
    leadName,
    firstName: firstNameFromLeadName(leadName),
    agentName: input.agentName?.trim() || "",
    workspaceName: input.workspaceName?.trim() || "",
    propertyAddress: input.propertyAddress?.trim() || "",
  };
}

export async function listRenderedSmsQuickTextsForLead(
  db: QuickTextLeadDb & { smsQuickText?: SmsQuickTextDb["smsQuickText"] },
  ctx: AgentOrgContext,
  leadId: string,
): Promise<AgentSmsQuickTextView[]> {
  if (!db.smsQuickText) return [];
  const quickDb = { smsQuickText: db.smsQuickText };
  const rows = await listActiveSmsQuickTexts(quickDb);
  const id = leadId.trim();
  const lead = id
    ? ctx.workspaceId
      ? await db.lead.findUnique({
          where: {
            workspaceId_id: { workspaceId: ctx.workspaceId, id },
          },
          select: {
            customer: { select: { name: true } },
            workspace: { select: { name: true } },
          },
        })
      : await db.lead.findUnique({
          where: { id },
          select: {
            customer: { select: { name: true } },
            workspace: { select: { name: true } },
          },
        })
    : null;
  const context = smsQuickTextContextFromLead({
    leadName: lead?.customer?.name ?? null,
    agentName: frozenAgentSenderName(ctx.user),
    workspaceName: lead?.workspace?.name ?? null,
    propertyAddress: null,
  });
  return rows.map((row) => {
    const serialized = serializeSmsQuickText(row);
    return {
      id: serialized.id,
      key: serialized.key,
      name: serialized.name,
      category: serialized.category,
      body: serialized.body,
      rendered: renderSmsQuickText(row.body, context),
    };
  });
}

export function prismaAgentSmsQuickTextDb(prisma: PrismaClient) {
  return prismaSmsQuickTextDb(prisma);
}
