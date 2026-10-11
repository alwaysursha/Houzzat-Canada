/**
 * Agent LISTING_SHARE picker search (M4X).
 *
 * Inventory hit → Neon hydrate → M4U buildListingShareSnapshot gate.
 * Only shareable, guest/IDX-safe ACTIVE / SOLD_CONDITIONAL rows are returned.
 * Never trust client workspaceId / organizationId / providerKey.
 */

import type { ListingSharePresentView } from "@/lib/conversations/listing-share/payload";
import {
  LISTING_SHARE_SOURCE_SELECT,
  buildListingShareSnapshot,
  type ListingShareSourceListing,
} from "@/lib/conversations/listing-share";
import type { WorkspaceListingEntitlement } from "@/lib/tenancy/listing-entitlement";

export const AGENT_LISTING_SHARE_SEARCH_MIN_Q = 2;
export const AGENT_LISTING_SHARE_SEARCH_MAX_Q = 64;
export const AGENT_LISTING_SHARE_SEARCH_LIMIT = 12;
export const AGENT_LISTING_SHARE_SEARCH_DEBOUNCE_MS = 300;

export type AgentListingSharePickerItem = {
  listingId: string;
  mlsNumber: string;
  preview: ListingSharePresentView;
};

export type AgentListingShareSearchDb = {
  listing: {
    findMany: (args: Record<string, unknown>) => Promise<
      Array<
        ListingShareSourceListing & {
          media?: Array<{
            url: string;
            isPrimary: boolean;
            sortOrder: number;
          }>;
        }
      >
    >;
  };
};

export type AgentListingShareInventoryHit = {
  mlsNumber: string;
};

export type SearchAgentListingSharePickerInput = {
  q: string;
  entitlement: WorkspaceListingEntitlement;
  trustedWorkspaceId: string;
  /** Typesense/Neon inventory search — statuses already constrained by caller. */
  searchInventory: (input: {
    q: string;
    limit: number;
    entitlement: WorkspaceListingEntitlement;
  }) => Promise<{ items: AgentListingShareInventoryHit[] }>;
  now?: Date;
  limit?: number;
  entitlementFilteringEnabled?: boolean;
};

export function parseAgentListingShareSearchQuery(
  raw: string | null | undefined,
):
  | { ok: true; q: string }
  | { ok: false; reason: "EMPTY" | "TOO_SHORT" | "TOO_LONG" } {
  const q = (raw ?? "").trim();
  if (!q) return { ok: false, reason: "EMPTY" };
  if (q.length < AGENT_LISTING_SHARE_SEARCH_MIN_Q) {
    return { ok: false, reason: "TOO_SHORT" };
  }
  if (q.length > AGENT_LISTING_SHARE_SEARCH_MAX_Q) {
    return { ok: false, reason: "TOO_LONG" };
  }
  return { ok: true, q };
}

function primaryMediaUrl(
  media:
    | Array<{ url: string; isPrimary: boolean; sortOrder: number }>
    | undefined,
): string | null {
  if (!media?.length) return null;
  const primary =
    media.find((row) => row.isPrimary) ??
    [...media].sort((a, b) => a.sortOrder - b.sortOrder)[0];
  return primary?.url ?? null;
}

/**
 * Search shareable listings for the agent picker.
 * Fail closed: entitlement mismatch or snapshot denial → omit row.
 */
export async function searchAgentListingSharePicker(
  db: AgentListingShareSearchDb,
  input: SearchAgentListingSharePickerInput,
): Promise<
  | { ok: true; items: AgentListingSharePickerItem[] }
  | { ok: false; reason: "FORBIDDEN" | "INVALID_QUERY" }
> {
  const parsed = parseAgentListingShareSearchQuery(input.q);
  if (!parsed.ok) return { ok: false, reason: "INVALID_QUERY" };

  const trustedWorkspaceId = input.trustedWorkspaceId.trim();
  if (
    !trustedWorkspaceId ||
    input.entitlement.workspaceId !== trustedWorkspaceId
  ) {
    return { ok: false, reason: "FORBIDDEN" };
  }

  const limit = Math.min(
    Math.max(1, input.limit ?? AGENT_LISTING_SHARE_SEARCH_LIMIT),
    AGENT_LISTING_SHARE_SEARCH_LIMIT,
  );

  const inventory = await input.searchInventory({
    q: parsed.q,
    limit,
    entitlement: input.entitlement,
  });

  const mlsNumbers: string[] = [];
  const seen = new Set<string>();
  for (const hit of inventory.items) {
    const mls = hit.mlsNumber?.trim().toUpperCase();
    if (!mls || seen.has(mls)) continue;
    seen.add(mls);
    mlsNumbers.push(mls);
    if (mlsNumbers.length >= limit) break;
  }
  if (mlsNumbers.length === 0) {
    return { ok: true, items: [] };
  }

  const rows = await db.listing.findMany({
    where: { mlsNumber: { in: mlsNumbers } },
    select: {
      ...LISTING_SHARE_SOURCE_SELECT,
      media: {
        select: { url: true, isPrimary: true, sortOrder: true },
        orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
        take: 3,
      },
    },
  });

  const byMls = new Map<
    string,
    ListingShareSourceListing & {
      media?: Array<{ url: string; isPrimary: boolean; sortOrder: number }>;
    }
  >();
  for (const row of rows) {
    byMls.set(row.mlsNumber.trim().toUpperCase(), row);
  }

  const items: AgentListingSharePickerItem[] = [];
  for (const mls of mlsNumbers) {
    const row = byMls.get(mls);
    if (!row) continue;
    const { media, ...listing } = row;
    const snapshot = buildListingShareSnapshot({
      entitlement: input.entitlement,
      trustedWorkspaceId,
      listing,
      primaryMediaUrl: primaryMediaUrl(media),
      now: input.now,
      entitlementFilteringEnabled: input.entitlementFilteringEnabled ?? true,
    });
    if (!snapshot.ok) continue;
    items.push({
      listingId: snapshot.payload.listingId,
      mlsNumber: snapshot.payload.mlsNumber,
      preview: snapshot.payload,
    });
  }

  return { ok: true, items };
}
