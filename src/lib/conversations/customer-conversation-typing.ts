/**
 * Customer typing heartbeat for Chat V1.
 */

import { isConsumerRole } from "@/lib/roles";
import { allowConversationTypingHeartbeat } from "@/lib/chat/typing/rate-limit";
import { parseTypingActiveBody } from "@/lib/chat/typing/state";
import {
  setConversationTypingState,
  type ConversationTypingDb,
} from "@/lib/chat/typing/update";
import { ensureCustomerChatLead } from "@/lib/conversations/customer-chat-lead";
import {
  findLeadConversation,
  getOrCreateLeadConversation,
} from "@/lib/conversations/lead-conversation";
import {
  type CustomerConversationApiDeps,
  type CustomerConversationHttpResult,
  type CustomerSendAccess,
} from "@/lib/conversations/customer-conversation";
import { resolveWorkspaceFromRequest } from "@/lib/tenancy/resolve-workspace-host";
import { requireFullCustomerUser } from "@/lib/account";

function jsonResult(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): CustomerConversationHttpResult {
  return { status, body, headers: headers ?? {} };
}

async function defaultRequireSendAccess(): Promise<CustomerSendAccess> {
  const access = await requireFullCustomerUser();
  if (access.denied) {
    let body: unknown = { error: "Sign in required.", requiresAuth: true };
    try {
      body = await access.denied.clone().json();
    } catch {
      // keep default
    }
    return { ok: false, status: access.denied.status, body };
  }
  return { ok: true, user: access.user };
}

export async function handleCustomerConversationTyping(
  request: Request,
  deps: CustomerConversationApiDeps,
): Promise<CustomerConversationHttpResult> {
  const requireSendAccess = deps.requireSendAccess ?? defaultRequireSendAccess;
  const access = await requireSendAccess();
  if (!access.ok) return jsonResult(access.status, access.body);
  if (!isConsumerRole(access.user.role)) {
    return jsonResult(404, { error: "Not found" });
  }

  const host = await (deps.resolveWorkspaceFromRequest ??
    resolveWorkspaceFromRequest)(request, deps.hostDeps);
  if (!host.ok) return jsonResult(404, { error: "Not found" });

  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    return jsonResult(400, { error: "Invalid payload" });
  }
  const parsed = parseTypingActiveBody(raw);
  if (!parsed.ok) {
    return jsonResult(400, { error: "Invalid payload" });
  }

  const rate = allowConversationTypingHeartbeat({
    userId: access.user.id,
    workspaceId: host.workspaceId,
  });
  if (!rate.allowed) {
    return jsonResult(
      429,
      { error: "Too many typing updates.", code: "RATE_LIMITED" },
      { "Retry-After": String(rate.retryAfterSec) },
    );
  }

  const ensured = await (deps.ensureCustomerChatLead ?? ensureCustomerChatLead)({
    request,
    untrustedClientHints: null,
    hostDeps: deps.hostDeps,
    deps: deps.resolverDeps,
  });
  if (!ensured.ok) {
    return jsonResult(404, { error: "Not found" });
  }

  const existing = await findLeadConversation(deps.db, {
    workspaceId: ensured.workspaceId,
    leadId: ensured.leadId,
  });
  if (existing?.status === "BLOCKED") {
    return jsonResult(403, {
      error: "Chat is unavailable.",
      code: "CHAT_BLOCKED",
    });
  }

  const created = existing
    ? { ok: true as const, conversation: existing }
    : await getOrCreateLeadConversation(deps.db, {
        workspaceId: ensured.workspaceId,
        leadId: ensured.leadId,
      });
  if (!created.ok) {
    return jsonResult(503, { error: "Chat is temporarily unavailable." });
  }

  const result = await setConversationTypingState(
    deps.db as unknown as ConversationTypingDb,
    {
      workspaceId: ensured.workspaceId,
      conversationId: created.conversation.id,
      side: "customer",
      active: parsed.active,
    },
  );

  return jsonResult(200, {
    ok: true,
    active: parsed.active,
    updated: result.updated,
    skipped: result.skipped,
  });
}
