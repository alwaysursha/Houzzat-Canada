/**
 * V2 Conversations email-list loader. Auth is hostname → workspace → ACTIVE
 * member → canAccessLead. Never selects htmlBody or body. Preview is a separate
 * GET /api/agent/emails/[id].
 */
import type { AgentOrgContext } from "@/lib/agent";
import { v2CanAccessLead } from "@/lib/agent/lead-profile-v2/access";
import { v2EmailsPageTake } from "@/lib/agent/lead-profile-v2/emails-query";
import type { LeadProfileV2EmailsPanel } from "@/lib/agent/lead-profile-v2/types";
import { prisma } from "@/lib/prisma";

export const V2_EMAILS_ACCESS_SELECT = {
  id: true,
  organizationId: true,
  workspaceId: true,
  assignedAgentId: true,
} as const;

/** List columns only — never htmlBody or body. */
export const V2_EMAIL_LIST_SELECT = {
  id: true,
  subject: true,
  toEmail: true,
  kind: true,
  openedAt: true,
  clickedAt: true,
  openCount: true,
  clickCount: true,
  createdAt: true,
} as const;

export async function loadLeadProfileV2Emails(
  ctx: AgentOrgContext,
  leadId: string,
  input?: { before?: Date | null; take?: number },
): Promise<LeadProfileV2EmailsPanel | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: V2_EMAILS_ACCESS_SELECT,
  });
  if (!lead || !v2CanAccessLead(ctx, lead)) return null;

  const take = v2EmailsPageTake(input?.take);
  const emails = await prisma.leadEmailLog.findMany({
    where: {
      leadId: lead.id,
      ...(input?.before ? { createdAt: { lt: input.before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    select: V2_EMAIL_LIST_SELECT,
  });
  const hasMore = emails.length > take;
  const page = emails.slice(0, take);

  return {
    emails: page.map((email) => ({
      id: email.id,
      subject: email.subject,
      toEmail: email.toEmail,
      kind: email.kind,
      openedAt: email.openedAt?.toISOString() ?? null,
      clickedAt: email.clickedAt?.toISOString() ?? null,
      openCount: email.openCount,
      clickCount: email.clickCount,
      createdAt: email.createdAt.toISOString(),
    })),
    hasMore,
  };
}
