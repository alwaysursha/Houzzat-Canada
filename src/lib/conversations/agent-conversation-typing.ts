/**
 * Agent typing heartbeat for Chat V1 (assigned agent only).
 */

import type { AgentOrgContext } from "@/lib/agent";
import { allowConversationTypingHeartbeat } from "@/lib/chat/typing/rate-limit";
import { parseTypingActiveBody } from "@/lib/chat/typing/state";
import {
  setConversationTypingState,
  type ConversationTypingDb,
} from "@/lib/chat/typing/update";
import {
  loadAccessibleAgentConversationLead,
  type AgentConversationReadDb,
} from "@/lib/conversations/agent-conversation-read";
import {
  findLeadConversation,
  getOrCreateLeadConversation,
} from "@/lib/conversations/lead-conversation";

export async function setAgentLeadConversationTyping(
  db: AgentConversationReadDb & ConversationTypingDb,
  ctx: AgentOrgContext,
  leadId: string,
  request: Request,
): Promise<
  | {
      ok: true;
      data: { ok: true; active: boolean; updated: boolean; skipped: boolean };
    }
  | { ok: false; status: number; body: unknown }
> {
  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, status: 400, body: { error: "Invalid payload" } };
  }
  const parsed = parseTypingActiveBody(raw);
  if (!parsed.ok) {
    return { ok: false, status: 400, body: { error: "Invalid payload" } };
  }

  const lead = await loadAccessibleAgentConversationLead(db, ctx, leadId);
  if (!lead?.workspaceId) {
    return { ok: false, status: 404, body: { error: "Not found" } };
  }
  if (!lead.assignedAgentId || lead.assignedAgentId !== ctx.user.id) {
    return { ok: false, status: 403, body: { error: "Forbidden" } };
  }

  const rate = allowConversationTypingHeartbeat({
    userId: ctx.user.id,
    workspaceId: lead.workspaceId,
  });
  if (!rate.allowed) {
    return {
      ok: false,
      status: 429,
      body: {
        error: "Too many typing updates.",
        code: "RATE_LIMITED",
        retryAfterSec: rate.retryAfterSec,
      },
    };
  }

  const existing = await findLeadConversation(db, {
    workspaceId: lead.workspaceId,
    leadId: lead.id,
  });
  const created = existing
    ? { ok: true as const, conversation: existing }
    : await getOrCreateLeadConversation(db, {
        workspaceId: lead.workspaceId,
        leadId: lead.id,
      });
  if (!created.ok) {
    return { ok: false, status: 404, body: { error: "Not found" } };
  }

  const result = await setConversationTypingState(db, {
    workspaceId: lead.workspaceId,
    conversationId: created.conversation.id,
    side: "agent",
    active: parsed.active,
  });

  return {
    ok: true,
    data: {
      ok: true,
      active: parsed.active,
      updated: result.updated,
      skipped: result.skipped,
    },
  };
}
