/**
 * Client-safe Conversation live refresh helpers.
 * Reuses existing GET transcripts. No sockets, SSE, or extra writes.
 */
export const CONVERSATION_LIVE_POLL_MS = 3000;

export function conversationLiveVisible(
  doc?: { visibilityState?: string } | null,
): boolean {
  const state = doc?.visibilityState;
  if (!state) return true;
  return state === "visible";
}

export function conversationLivePollShouldTick(input: {
  enabled: boolean;
  visible: boolean;
  inFlight: boolean;
  hasLoaded: boolean;
}): boolean {
  return (
    input.enabled && input.visible && !input.inFlight && input.hasLoaded
  );
}

export function mergeLiveConversationMessages<T extends { id: string }>(
  prev: T[],
  incoming: T[],
): T[] {
  const seen = new Set(prev.map((row) => row.id));
  const unique: T[] = [];
  for (const row of incoming) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    unique.push(row);
  }
  if (unique.length === 0) return prev;
  return [...prev, ...unique];
}
