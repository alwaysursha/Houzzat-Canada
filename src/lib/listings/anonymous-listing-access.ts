/**
 * Anonymous listing-detail gate.
 * Search/map browsing stays free. The first property DETAIL view is gated.
 * Retires the prior "first MLS free" allowance — conflicting free-count rules
 * must not remain.
 */
export const LISTING_ACCESS_STORAGE_KEY = "houzzat:listing-access";

export const LISTING_ACCESS_EVENT = "houzzat:listing-access";

const MLS_PATTERN = /^[A-Z0-9]{3,32}$/;

export type ListingAccessStore = {
  get(): string | null;
  set(value: string): void;
};

export type AnonymousListingAccess =
  | { access: "gate"; mlsNumber: string }
  | { access: "storage_unavailable" };

export function normalizeListingAccessMls(raw: string): string | null {
  const mls = raw.trim().toUpperCase();
  if (!MLS_PATTERN.test(mls)) return null;
  return mls;
}

/**
 * Every anonymous detail view is gated. Authenticated callers never use this.
 * Storage is no longer used for a free-MLS allowance (key kept for cleanup).
 */
export function resolveAnonymousListingAccess(
  _store: ListingAccessStore,
  mlsNumberRaw: string,
): AnonymousListingAccess {
  const mlsNumber = normalizeListingAccessMls(mlsNumberRaw);
  if (!mlsNumber) return { access: "storage_unavailable" };
  return { access: "gate", mlsNumber };
}

/** @deprecated Kept for selftest/compat imports; free-MLS serialization retired. */
export function serializeListingAccess(mlsNumber: string): string {
  return JSON.stringify({ v: 1, mlsNumber });
}

export function browserListingAccessStore(): ListingAccessStore {
  return {
    get() {
      return localStorage.getItem(LISTING_ACCESS_STORAGE_KEY);
    },
    set(value) {
      localStorage.setItem(LISTING_ACCESS_STORAGE_KEY, value);
    },
  };
}

export function subscribeListingAccess(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key != null && event.key !== LISTING_ACCESS_STORAGE_KEY) return;
    onChange();
  };
  const onLocal = () => {
    onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(LISTING_ACCESS_EVENT, onLocal);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(LISTING_ACCESS_EVENT, onLocal);
  };
}

/** Always null — free-MLS snapshot retired. */
export function getListingAccessSnapshot(): string | null {
  return null;
}

export function getListingAccessUnavailableSnapshot(): boolean {
  return false;
}

export function getListingAccessServerSnapshot(): string | null {
  return null;
}

export function getListingAccessUnavailableServerSnapshot(): boolean {
  return false;
}

export function setListingAccessWriteFailed(_failed: boolean): void {
  /* no-op — free-MLS write path retired */
}

export function notifyListingAccess(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(LISTING_ACCESS_EVENT));
}
