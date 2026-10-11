/**
 * Client helpers for agent "My Quick Replies" (CHAT only).
 * Insert never sends. Bodies are plain text.
 * Keep constants aligned with server AGENT_CHAT_QUICK_REPLY_* limits.
 */

export const AGENT_QUICK_REPLIES_ROUTE = "/api/agent/quick-replies";

export const AGENT_QUICK_REPLY_NAME_MAX = 80;
export const AGENT_QUICK_REPLY_BODY_MAX = 4000;

export type AgentQuickReply = {
  id: string;
  name: string;
  body: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export function agentQuickReplyRoute(id: string): string {
  return `${AGENT_QUICK_REPLIES_ROUTE}/${encodeURIComponent(id)}`;
}

export function previewQuickReplyBody(
  body: string,
  maxChars: number = 72,
): string {
  const normalized = body.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function filterAgentQuickReplies(
  replies: readonly AgentQuickReply[],
  query: string,
): AgentQuickReply[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...replies];
  return replies.filter((reply) => {
    return (
      reply.name.toLowerCase().includes(needle) ||
      reply.body.toLowerCase().includes(needle)
    );
  });
}

/**
 * Insert plain text at caret. Fails closed if the result would exceed maxLength
 * — never truncates the existing draft.
 */
export function insertQuickReplyAtCursor(input: {
  value: string;
  text: string;
  selectionStart: number;
  selectionEnd: number;
  maxLength: number;
}):
  | { ok: true; value: string; selectionStart: number; selectionEnd: number }
  | { ok: false; reason: "LIMIT" | "EMPTY" } {
  const text = input.text;
  if (!text) return { ok: false, reason: "EMPTY" };
  const start = Math.max(0, Math.min(input.selectionStart, input.value.length));
  const end = Math.max(start, Math.min(input.selectionEnd, input.value.length));
  const nextLength = input.value.length - (end - start) + text.length;
  if (nextLength > input.maxLength) {
    return { ok: false, reason: "LIMIT" };
  }
  const value = input.value.slice(0, start) + text + input.value.slice(end);
  const caret = start + text.length;
  return { ok: true, value, selectionStart: caret, selectionEnd: caret };
}

async function readJson(res: Response): Promise<unknown> {
  try {
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function fetchAgentQuickReplies(): Promise<
  | { ok: true; replies: AgentQuickReply[] }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch(AGENT_QUICK_REPLIES_ROUTE, {
      method: "GET",
      cache: "no-store",
    });
    const json = await readJson(res);
    if (!res.ok) {
      return { ok: false, error: "Couldn’t load quick replies." };
    }
    const replies = (json as { replies?: unknown })?.replies;
    if (!Array.isArray(replies)) {
      return { ok: false, error: "Couldn’t load quick replies." };
    }
    return {
      ok: true,
      replies: replies.filter(isAgentQuickReply),
    };
  } catch {
    return { ok: false, error: "Couldn’t load quick replies." };
  }
}

function isAgentQuickReply(value: unknown): value is AgentQuickReply {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    typeof row.body === "string" &&
    typeof row.sortOrder === "number"
  );
}

export async function createAgentQuickReply(input: {
  name: string;
  body: string;
}): Promise<
  | { ok: true; reply: AgentQuickReply }
  | { ok: false; error: string; code?: string }
> {
  try {
    const res = await fetch(AGENT_QUICK_REPLIES_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: input.name, body: input.body }),
    });
    const json = await readJson(res);
    if (res.status === 409) {
      return {
        ok: false,
        error: "You’ve reached the 50 quick-reply limit.",
        code: "QUICK_REPLY_QUOTA",
      };
    }
    if (!res.ok) {
      return { ok: false, error: "Couldn’t save quick reply." };
    }
    const reply = (json as { reply?: unknown })?.reply;
    if (!isAgentQuickReply(reply)) {
      return { ok: false, error: "Couldn’t save quick reply." };
    }
    return { ok: true, reply };
  } catch {
    return { ok: false, error: "Couldn’t save quick reply." };
  }
}

export async function updateAgentQuickReply(input: {
  id: string;
  name?: string;
  body?: string;
}): Promise<
  | { ok: true; reply: AgentQuickReply }
  | { ok: false; error: string }
> {
  try {
    const payload: { name?: string; body?: string } = {};
    if (input.name !== undefined) payload.name = input.name;
    if (input.body !== undefined) payload.body = input.body;
    const res = await fetch(agentQuickReplyRoute(input.id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await readJson(res);
    if (!res.ok) {
      return { ok: false, error: "Couldn’t update quick reply." };
    }
    const reply = (json as { reply?: unknown })?.reply;
    if (!isAgentQuickReply(reply)) {
      return { ok: false, error: "Couldn’t update quick reply." };
    }
    return { ok: true, reply };
  } catch {
    return { ok: false, error: "Couldn’t update quick reply." };
  }
}

export async function deleteAgentQuickReply(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(agentQuickReplyRoute(id), {
      method: "DELETE",
    });
    if (!res.ok) {
      return { ok: false, error: "Couldn’t delete quick reply." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn’t delete quick reply." };
  }
}
