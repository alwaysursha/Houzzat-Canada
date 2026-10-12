/**
 * Client helpers for agent Share Property picker (CHAT only).
 * Search/send never invent listing fields — server builds the snapshot.
 */

import type { ListingSharePresentView } from "@/lib/conversations/listing-share/payload";

export const AGENT_LISTING_SHARE_SEARCH_ROUTE =
  "/api/agent/listings/share-search";

export const AGENT_LISTING_SHARE_SEARCH_DEBOUNCE_MS = 300;
export const AGENT_LISTING_SHARE_SEARCH_MIN_Q = 2;
export const AGENT_LISTING_SHARE_SEARCH_MAX_Q = 64;

export type AgentListingSharePickerItem = {
  listingId: string;
  mlsNumber: string;
  preview: ListingSharePresentView;
};

export function agentListingShareSendUrl(leadId: string): string {
  return `/api/agent/leads/${encodeURIComponent(leadId)}/conversation/listing-share`;
}

export function agentListingShareSearchUrl(query: string): string {
  const params = new URLSearchParams();
  params.set("q", query);
  return `${AGENT_LISTING_SHARE_SEARCH_ROUTE}?${params.toString()}`;
}

/** Stable client key for one intended share (retry-safe). */
export function newListingShareIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ls_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Bind an idempotency key to a listing selection.
 * Same listing → reuse key; different listing → new key.
 */
export function resolveListingShareIdempotencyKey(input: {
  listingId: string;
  previous: { listingId: string; key: string } | null;
}): { listingId: string; key: string } {
  if (input.previous && input.previous.listingId === input.listingId) {
    return input.previous;
  }
  return {
    listingId: input.listingId,
    key: newListingShareIdempotencyKey(),
  };
}

export function listingShareSearchErrorMessage(status: number): string {
  if (status === 401) return "Your session expired. Sign in again.";
  if (status === 403) return "Property search isn’t available right now.";
  if (status === 503) return "Search is temporarily unavailable.";
  return "Couldn’t search properties. Try again.";
}

export function listingShareSendErrorMessage(
  status: number,
  serverError?: string | null,
): string {
  if (status === 401) return "Your session expired. Sign in again.";
  if (status === 403) {
    const text = (serverError ?? "").toLowerCase();
    if (text.includes("listing")) {
      return "This property can’t be shared right now.";
    }
    return "You can’t share a property in this conversation.";
  }
  if (status === 404) return "This property isn’t available.";
  if (status === 409) {
    return "This share couldn’t be completed. Try selecting the property again.";
  }
  if (status === 503) return "Sharing is temporarily unavailable.";
  return "Couldn’t share this property. Check your connection and try again.";
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

function parsePickerItems(raw: unknown): AgentListingSharePickerItem[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const out: AgentListingSharePickerItem[] = [];
  for (const row of items) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const item = row as Record<string, unknown>;
    if (typeof item.listingId !== "string" || typeof item.mlsNumber !== "string") {
      continue;
    }
    if (!item.preview || typeof item.preview !== "object") continue;
    out.push({
      listingId: item.listingId,
      mlsNumber: item.mlsNumber,
      preview: item.preview as ListingSharePresentView,
    });
  }
  return out;
}

export async function fetchAgentListingShareSearch(
  query: string,
  signal?: AbortSignal,
): Promise<
  | { ok: true; items: AgentListingSharePickerItem[] }
  | { ok: false; error: string }
> {
  const q = query.trim();
  if (q.length < AGENT_LISTING_SHARE_SEARCH_MIN_Q) {
    return { ok: true, items: [] };
  }
  if (q.length > AGENT_LISTING_SHARE_SEARCH_MAX_Q) {
    return { ok: false, error: "Search is too long." };
  }
  try {
    const res = await fetch(agentListingShareSearchUrl(q), {
      method: "GET",
      credentials: "same-origin",
      signal,
    });
    const json = await readJson(res);
    if (!res.ok) {
      return {
        ok: false,
        error: listingShareSearchErrorMessage(res.status),
      };
    }
    return { ok: true, items: parsePickerItems(json) };
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === "AbortError"
    ) {
      throw error;
    }
    return {
      ok: false,
      error: "Couldn’t search properties. Check your connection and try again.",
    };
  }
}

export type PostAgentListingShareResult =
  | {
      ok: true;
      message: unknown;
      replayed: boolean;
    }
  | { ok: false; error: string; status: number };

export async function postAgentListingShare(
  leadId: string,
  body:
    | { listingId: string; idempotencyKey: string; mlsNumber?: undefined }
    | { mlsNumber: string; idempotencyKey: string; listingId?: undefined },
  signal?: AbortSignal,
): Promise<PostAgentListingShareResult> {
  try {
    const res = await fetch(agentListingShareSendUrl(leadId), {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        ...(body.listingId ? { listingId: body.listingId } : {}),
        ...(body.mlsNumber ? { mlsNumber: body.mlsNumber } : {}),
        idempotencyKey: body.idempotencyKey,
      }),
    });
    const json = (await readJson(res)) as {
      error?: string;
      message?: unknown;
      replayed?: boolean;
    } | null;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: listingShareSendErrorMessage(res.status, json?.error ?? null),
      };
    }
    if (!json?.message) {
      return {
        ok: false,
        status: 500,
        error: listingShareSendErrorMessage(500),
      };
    }
    return {
      ok: true,
      message: json.message,
      replayed: Boolean(json.replayed),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    return {
      ok: false,
      status: 0,
      error: listingShareSendErrorMessage(0),
    };
  }
}
