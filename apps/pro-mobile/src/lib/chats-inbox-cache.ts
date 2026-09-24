/**
 * Short-lived Chats inbox cache — avoids cold refetch on every tab revisit.
 * Pull-to-refresh and explicit Retry still force network.
 */

import type { MobileChatsInboxRow } from "./chats-response";

const TTL_MS = 60_000;

type ChatsInboxCacheEntry = {
  workspaceId: string;
  rows: MobileChatsInboxRow[];
  nextCursor: string | null;
  hasMore: boolean;
  filter: "all" | "unread";
  q: string;
  timestamp: number;
};

let store: ChatsInboxCacheEntry | null = null;

export function getChatsInboxCache(input: {
  workspaceId: string;
  filter: "all" | "unread";
  q: string;
}): ChatsInboxCacheEntry | null {
  if (!store) return null;
  if (store.workspaceId !== input.workspaceId) return null;
  if (store.filter !== input.filter) return null;
  if (store.q !== input.q) return null;
  if (Date.now() - store.timestamp > TTL_MS) return null;
  return store;
}

export function setChatsInboxCache(entry: Omit<ChatsInboxCacheEntry, "timestamp">) {
  store = { ...entry, timestamp: Date.now() };
}

export function clearChatsInboxCache(workspaceId?: string) {
  if (!workspaceId) {
    store = null;
    return;
  }
  if (store?.workspaceId === workspaceId) store = null;
}

export const CHATS_INBOX_CACHE_TTL_MS = TTL_MS;
