/**
 * Anonymous free-listing allowance.
 * One MLS per origin. Not recent views, analytics, or Capture Intent.
 */
export const LISTING_ACCESS_STORAGE_KEY = "houzzat:listing-access";

export const LISTING_ACCESS_EVENT = "houzzat:listing-access";

const RECORD_VERSION = 1;
const MLS_PATTERN = /^[A-Z0-9]{3,32}$/;

export type ListingAccessStore = {
  get(): string | null;
  set(value: string): void;
};

export type AnonymousListingAccess =
  | { access: "allow"; recorded: boolean }
  | { access: "gate"; freeMlsNumber: string }
  | { access: "storage_unavailable" };

type ParsedAllowance =
  | { status: "empty" }
  | { status: "ok"; mlsNumber: string }
  | { status: "corrupt" }
  | { status: "unavailable" };

export function normalizeListingAccessMls(raw: string): string | null {
  const mls = raw.trim().toUpperCase();
  if (!MLS_PATTERN.test(mls)) return null;
  return mls;
}

export function serializeListingAccess(mlsNumber: string): string {
  return JSON.stringify({ v: RECORD_VERSION, mlsNumber });
}

function parseAllowance(raw: string | null): Exclude<ParsedAllowance, { status: "unavailable" }> {
  if (raw == null || raw.trim() === "") return { status: "empty" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "corrupt" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { status: "corrupt" };
  }
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !keys.includes("v") || !keys.includes("mlsNumber")) {
    return { status: "corrupt" };
  }
  if (record.v !== RECORD_VERSION) return { status: "corrupt" };
  if (typeof record.mlsNumber !== "string") return { status: "corrupt" };
  const mlsNumber = normalizeListingAccessMls(record.mlsNumber);
  if (!mlsNumber || mlsNumber !== record.mlsNumber) return { status: "corrupt" };
  return { status: "ok", mlsNumber };
}

function readAllowance(store: ListingAccessStore): ParsedAllowance {
  try {
    return parseAllowance(store.get());
  } catch {
    return { status: "unavailable" };
  }
}

/**
 * Record the first MLS or keep the one already stored.
 * A later MLS does not replace it. Corrupt records are replaced by the
 * listing being opened, so one free MLS remains.
 */
export function resolveAnonymousListingAccess(
  store: ListingAccessStore,
  mlsNumberRaw: string,
): AnonymousListingAccess {
  const mlsNumber = normalizeListingAccessMls(mlsNumberRaw);
  if (!mlsNumber) return { access: "storage_unavailable" };

  const current = readAllowance(store);
  if (current.status === "unavailable") return { access: "storage_unavailable" };
  if (current.status === "ok") {
    if (current.mlsNumber === mlsNumber) return { access: "allow", recorded: false };
    return { access: "gate", freeMlsNumber: current.mlsNumber };
  }

  const next = serializeListingAccess(mlsNumber);
  try {
    store.set(next);
  } catch {
    return { access: "storage_unavailable" };
  }

  const after = readAllowance(store);
  if (after.status === "unavailable") return { access: "storage_unavailable" };
  if (after.status === "ok" && after.mlsNumber === mlsNumber) {
    return { access: "allow", recorded: true };
  }
  if (after.status === "ok") {
    return { access: "gate", freeMlsNumber: after.mlsNumber };
  }
  return { access: "storage_unavailable" };
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

let snapshotRaw: string | null | undefined;
let snapshotMls: string | null = null;
let snapshotUnavailable = false;
let writeFailed = false;

export function setListingAccessWriteFailed(failed: boolean): void {
  writeFailed = failed;
}

function readBrowserAllowance(): void {
  if (typeof window === "undefined") {
    snapshotRaw = null;
    snapshotMls = null;
    snapshotUnavailable = false;
    return;
  }
  let raw: string | null;
  try {
    raw = localStorage.getItem(LISTING_ACCESS_STORAGE_KEY);
  } catch {
    snapshotRaw = undefined;
    snapshotMls = null;
    snapshotUnavailable = true;
    return;
  }
  if (raw === snapshotRaw && !snapshotUnavailable) return;
  snapshotUnavailable = false;
  snapshotRaw = raw;
  const parsed = parseAllowance(raw);
  snapshotMls = parsed.status === "ok" ? parsed.mlsNumber : null;
}

export function subscribeListingAccess(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key != null && event.key !== LISTING_ACCESS_STORAGE_KEY) return;
    snapshotRaw = undefined;
    onChange();
  };
  const onLocal = () => {
    snapshotRaw = undefined;
    onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(LISTING_ACCESS_EVENT, onLocal);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(LISTING_ACCESS_EVENT, onLocal);
  };
}

export function getListingAccessSnapshot(): string | null {
  readBrowserAllowance();
  return snapshotMls;
}

export function getListingAccessUnavailableSnapshot(): boolean {
  readBrowserAllowance();
  return snapshotUnavailable || writeFailed;
}

export function getListingAccessServerSnapshot(): string | null {
  return null;
}

export function getListingAccessUnavailableServerSnapshot(): boolean {
  return false;
}

export function notifyListingAccess(): void {
  if (typeof window === "undefined") return;
  snapshotRaw = undefined;
  window.dispatchEvent(new Event(LISTING_ACCESS_EVENT));
}
