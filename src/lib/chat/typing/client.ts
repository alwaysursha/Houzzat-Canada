/**
 * Client-safe typing heartbeat helpers (no Prisma).
 */

export const TYPING_HEARTBEAT_MS = 2_500;
export const TYPING_IDLE_STOP_MS = 2_000;

export function customerChatTypingRoute(): string {
  return "/api/account/conversation/typing";
}

export function agentChatTypingRoute(leadId: string): string {
  return `/api/agent/leads/${encodeURIComponent(leadId)}/conversation/typing`;
}

export function shouldSendTypingHeartbeat(input: {
  now: number;
  lastSentAt: number | null;
  heartbeatMs?: number;
}): boolean {
  if (input.lastSentAt == null) return true;
  const heartbeatMs = input.heartbeatMs ?? TYPING_HEARTBEAT_MS;
  return input.now - input.lastSentAt >= heartbeatMs;
}

export function peerTypingFromPayload(
  peerTyping: boolean | null | undefined,
): boolean {
  return peerTyping === true;
}

export async function postTypingActive(
  url: string,
  active: boolean,
  init?: { keepalive?: boolean; signal?: AbortSignal },
): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
      keepalive: Boolean(init?.keepalive),
      signal: init?.signal,
    });
    return res.ok;
  } catch {
    return false;
  }
}
