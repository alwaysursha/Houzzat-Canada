/**
 * Stage 5.8 — Communications list/detail response unwrap helpers.
 */

import type {
  MobileCommunicationDetail,
  MobileCommunicationItem,
} from "../types/lead";

export function unwrapCommunicationsList(payload: unknown): {
  items: MobileCommunicationItem[];
  nextCursor: string | null;
  hasMore: boolean;
} {
  const empty = { items: [] as MobileCommunicationItem[], nextCursor: null, hasMore: false };
  if (!payload || typeof payload !== "object") return empty;
  const root = payload as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;
  const items = Array.isArray(data.communications)
    ? (data.communications as MobileCommunicationItem[])
    : [];
  return {
    items,
    nextCursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
    hasMore: Boolean(data.hasMore),
  };
}

export function unwrapCommunicationDetail(payload: unknown): {
  communication: MobileCommunicationDetail | null;
  composer: {
    toEmail: string | null;
    consented: boolean;
    alertsEnabled: boolean;
  };
} {
  const defaults = {
    communication: null as MobileCommunicationDetail | null,
    composer: {
      toEmail: null as string | null,
      consented: false,
      alertsEnabled: true,
    },
  };
  if (!payload || typeof payload !== "object") return defaults;
  const root = payload as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;
  const communication =
    data.communication && typeof data.communication === "object"
      ? (data.communication as MobileCommunicationDetail)
      : null;
  const composerRaw =
    data.composer && typeof data.composer === "object"
      ? (data.composer as Record<string, unknown>)
      : null;
  return {
    communication,
    composer: {
      toEmail:
        typeof composerRaw?.toEmail === "string" ? composerRaw.toEmail : null,
      consented: Boolean(composerRaw?.consented),
      alertsEnabled: composerRaw?.alertsEnabled !== false,
    },
  };
}

export function buildCommunicationsQuery(opts: {
  q?: string;
  cursor?: string | null;
  limit?: number;
  channel?: "all" | "email";
}): string {
  const parts: string[] = [];
  if (opts.limit) parts.push(`limit=${opts.limit}`);
  if (opts.channel && opts.channel !== "all") {
    parts.push(`channel=${encodeURIComponent(opts.channel)}`);
  }
  if (opts.q?.trim()) parts.push(`q=${encodeURIComponent(opts.q.trim())}`);
  if (opts.cursor) parts.push(`cursor=${encodeURIComponent(opts.cursor)}`);
  return parts.length ? `?${parts.join("&")}` : "";
}
