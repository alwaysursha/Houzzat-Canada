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
  };
}
