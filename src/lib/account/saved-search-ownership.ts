/**
 * Minimal owned SavedSearch mutation helpers for Phase 3A ownership tests
 * and route safety. Full PATCH field surface stays on the API route.
 */

export type OwnedSavedSearchRow = {
  id: string;
  userId: string;
  name: string;
  emailAlerts: boolean;
  smsAlerts: boolean;
  isPrimary: boolean;
  isHomepageActive: boolean;
  query?: unknown;
};

export type OwnedSavedSearchStore = {
  findOwned(input: {
    id: string;
    userId: string;
  }): Promise<OwnedSavedSearchRow | null>;
  updateEmailAlerts(input: {
    id: string;
    userId: string;
    emailAlerts: boolean;
  }): Promise<OwnedSavedSearchRow | null>;
  deleteOwned(input: { id: string; userId: string }): Promise<boolean>;
};

export async function patchOwnedSavedSearchEmailAlerts(
  store: OwnedSavedSearchStore,
  input: {
    userId: string;
    id: string;
    emailAlerts: boolean;
  },
): Promise<
  | { ok: true; item: OwnedSavedSearchRow }
  | { ok: false; error: "not_found" }
> {
  const owned = await store.findOwned({
    id: input.id,
    userId: input.userId,
  });
  if (!owned) return { ok: false, error: "not_found" };
  const updated = await store.updateEmailAlerts(input);
  if (!updated) return { ok: false, error: "not_found" };
  return { ok: true, item: updated };
}

export function briefSavedSearchSummary(query: unknown): string | null {
  if (!query || typeof query !== "object" || Array.isArray(query)) return null;
  const q = query as Record<string, unknown>;
  const parts: string[] = [];
  if (Array.isArray(q.cities) && q.cities.length) {
    parts.push(
      q.cities
        .map((city) => String(city).trim())
        .filter(Boolean)
        .join(", "),
    );
  } else if (typeof q.city === "string" && q.city.trim()) {
    parts.push(q.city.trim());
  }
  if (typeof q.community === "string" && q.community.trim()) {
    parts.push(q.community.trim());
  }
  if (q.transactionType === "LEASE" || q.transactionType === "SALE") {
    parts.push(q.transactionType);
  }
  return parts.length ? parts.slice(0, 3).join(" · ") : null;
}

export async function deleteOwnedSavedSearch(
  store: OwnedSavedSearchStore,
  input: { userId: string; id: string },
): Promise<
  | { deleted: false; item: null }
  | { deleted: true; item: OwnedSavedSearchRow }
> {
  const owned = await store.findOwned({
    id: input.id,
    userId: input.userId,
  });
  if (!owned) return { deleted: false, item: null };
  const deleted = await store.deleteOwned({
    id: input.id,
    userId: input.userId,
  });
  if (!deleted) return { deleted: false, item: null };
  return { deleted: true, item: owned };
}

export function memoryOwnedSavedSearchStore(
  rows: OwnedSavedSearchRow[],
): OwnedSavedSearchStore & { rows: OwnedSavedSearchRow[] } {
  return {
    rows,
    async findOwned(input) {
      return (
        rows.find(
          (row) => row.id === input.id && row.userId === input.userId,
        ) ?? null
      );
    },
    async updateEmailAlerts(input) {
      const row = rows.find(
        (item) => item.id === input.id && item.userId === input.userId,
      );
      if (!row) return null;
      row.emailAlerts = input.emailAlerts;
      return { ...row };
    },
    async deleteOwned(input) {
      const index = rows.findIndex(
        (item) => item.id === input.id && item.userId === input.userId,
      );
      if (index < 0) return false;
      rows.splice(index, 1);
      return true;
    },
  };
}
