/**
 * Listing detail overlay stack — browse page stays mounted underneath.
 * Back pops one listing; Close clears the whole stack.
 */
import { mlsNumberFromListingPath } from "@/lib/listings/listing-path";

type Listener = (state: ListingSheetState) => void;

export type ListingSheetState = {
  href: string | null;
  depth: number;
  canBack: boolean;
  /** Top frame was opened from an ordered browsing list. */
  hasBrowse: boolean;
  previousHref: string | null;
  nextHref: string | null;
};

type ListingSheetFrame = {
  href: string;
  /** Canonical paths only. Null when this frame has no ordered context. */
  browse: readonly string[] | null;
};

let stack: ListingSheetFrame[] = [];
const listeners = new Set<Listener>();

export function normalizeListingSheetHref(href: string): string {
  try {
    const url = new URL(href, "https://houzzat.local");
    url.searchParams.delete("sheet");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

function sameListingHref(left: string, right: string): boolean {
  if (left === right) return true;
  const a = mlsNumberFromListingPath(left);
  const b = mlsNumberFromListingPath(right);
  return Boolean(a && b && a.toUpperCase() === b.toUpperCase());
}

function normalizeBrowse(
  hrefs: readonly string[] | null | undefined,
  current: string,
): readonly string[] | null {
  if (!hrefs || hrefs.length === 0) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of hrefs) {
    if (typeof raw !== "string" || !raw) continue;
    const href = normalizeListingSheetHref(raw);
    if (!href.startsWith("/listing/")) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push(href);
  }
  if (!out.some((href) => sameListingHref(href, current))) return null;
  return out;
}

function neighbors(frame: ListingSheetFrame | undefined): {
  hasBrowse: boolean;
  previousHref: string | null;
  nextHref: string | null;
} {
  if (!frame?.browse?.length) {
    return { hasBrowse: false, previousHref: null, nextHref: null };
  }
  const index = frame.browse.findIndex((href) =>
    sameListingHref(href, frame.href),
  );
  if (index < 0) {
    return { hasBrowse: false, previousHref: null, nextHref: null };
  }
  return {
    hasBrowse: true,
    previousHref: index > 0 ? frame.browse[index - 1]! : null,
    nextHref:
      index < frame.browse.length - 1 ? frame.browse[index + 1]! : null,
  };
}

function snapshot(): ListingSheetState {
  const frame = stack[stack.length - 1];
  const adjacent = neighbors(frame);
  return {
    href: frame?.href ?? null,
    depth: stack.length,
    canBack: stack.length > 1,
    hasBrowse: adjacent.hasBrowse,
    previousHref: adjacent.previousHref,
    nextHref: adjacent.nextHref,
  };
}

function emit() {
  const state = snapshot();
  for (const listener of listeners) listener(state);
}

export function getListingSheetState(): ListingSheetState {
  return snapshot();
}

export function getListingSheetHref(): string | null {
  return stack[stack.length - 1]?.href ?? null;
}

/**
 * Push a listing (or no-op if it's already on top).
 * `browse` is the ordered context that opened this listing. Omitted context
 * stays empty — stack history is not reused as Previous/Next.
 */
export function openListingSheet(
  href: string,
  browse?: readonly string[] | null,
) {
  const next = normalizeListingSheetHref(href);
  if (!next) return;
  const top = stack[stack.length - 1];
  if (top?.href === next) {
    persistListingSheetSession();
    emit();
    return;
  }
  stack = [
    ...stack,
    { href: next, browse: normalizeBrowse(browse, next) },
  ];
  persistListingSheetSession();
  emit();
}

/**
 * Move the current top listing to another path in ITS browsing context.
 * Does not push a stack frame and does not touch browser history.
 */
export function replaceListingSheet(href: string): boolean {
  const top = stack[stack.length - 1];
  if (!top?.browse) return false;
  const next = normalizeListingSheetHref(href);
  if (!top.browse.some((href) => sameListingHref(href, next))) return false;
  if (top.href === next) return true;
  stack = [...stack.slice(0, -1), { href: next, browse: top.browse }];
  persistListingSheetSession();
  emit();
  return true;
}

/** Pop one listing. Closes the sheet when the stack is empty. */
export function backListingSheet(): boolean {
  if (stack.length === 0) return false;
  if (stack.length === 1) {
    stack = [];
    clearPersistedListingSheet();
    emit();
    return false;
  }
  stack = stack.slice(0, -1);
  persistListingSheetSession();
  emit();
  return true;
}

/** Dismiss the overlay and clear every listing in the stack. */
export function closeListingSheet() {
  if (stack.length === 0) return;
  stack = [];
  clearPersistedListingSheet();
  emit();
}

export function subscribeListingSheet(listener: Listener): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => {
    listeners.delete(listener);
  };
}

export function isListingSheetOpen(): boolean {
  return stack.length > 0;
}

/**
 * The host still writes this marker onto the one overlay history entry so
 * Back / Close can dismiss it. Next's App Router HistoryUpdater replaces
 * `history.state` with only its own keys after a soft navigation
 * (`preserveCustomHistoryState: false`), so a real reload cannot trust this
 * marker. Reload identity lives in tab-scoped sessionStorage instead.
 */
export const LISTING_SHEET_HISTORY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type ListingSheetHistoryMarker = {
  houzzatListingSheet: true;
  houzzatListingHref: string;
  houzzatListingBrowse: readonly string[] | null;
  houzzatListingSavedAt: number;
};

const LISTING_SHEET_HISTORY_KEYS = [
  "houzzatListingSheet",
  "houzzatListingHref",
  "houzzatListingBrowse",
  "houzzatListingSavedAt",
] as const;

/** Marker for the listing currently on top, or null when the overlay is closed. */
export function captureListingSheetHistoryMarker(
  now = Date.now(),
): ListingSheetHistoryMarker | null {
  const frame = stack[stack.length - 1];
  if (!frame) return null;
  return {
    houzzatListingSheet: true,
    houzzatListingHref: frame.href,
    houzzatListingBrowse: frame.browse ? [...frame.browse] : null,
    houzzatListingSavedAt: now,
  };
}

export function restorableListingFromHistory(
  state: unknown,
  now = Date.now(),
): { href: string; browse: readonly string[] | null } | null {
  if (!state || typeof state !== "object") return null;
  const record = state as Partial<ListingSheetHistoryMarker>;
  if (record.houzzatListingSheet !== true) return null;
  if (
    typeof record.houzzatListingHref !== "string" ||
    !record.houzzatListingHref.startsWith("/listing/")
  ) {
    return null;
  }
  if (typeof record.houzzatListingSavedAt !== "number") return null;
  if (!Number.isFinite(record.houzzatListingSavedAt)) return null;
  if (now < record.houzzatListingSavedAt) return null;
  if (now - record.houzzatListingSavedAt > LISTING_SHEET_HISTORY_MAX_AGE_MS) {
    return null;
  }
  const browse = Array.isArray(record.houzzatListingBrowse)
    ? record.houzzatListingBrowse.filter(
        (href): href is string => typeof href === "string" && href.length > 0,
      )
    : null;
  return {
    href: record.houzzatListingHref,
    browse: browse && browse.length > 0 ? browse : null,
  };
}

/**
 * Reopen the listing stored on a history entry. No-ops when memory already
 * has a sheet (the live page) or the marker is missing/expired.
 */
export function restoreListingSheetFromHistory(
  state: unknown,
  now = Date.now(),
): boolean {
  if (stack.length > 0) return false;
  const restored = restorableListingFromHistory(state, now);
  if (!restored) return false;
  openListingSheet(restored.href, restored.browse);
  return sameListingHref(getListingSheetHref() ?? "", restored.href);
}

/** Drop overlay fields and keep the rest of the history entry intact. */
export function historyStateWithoutListingSheet(
  state: unknown,
): Record<string, unknown> {
  const base =
    state && typeof state === "object"
      ? { ...(state as Record<string, unknown>) }
      : {};
  for (const key of LISTING_SHEET_HISTORY_KEYS) {
    delete base[key];
  }
  return base;
}

/**
 * Tab-scoped overlay identity. Survives a hard reload of this tab and
 * stays in this tab's session only.
 */
export const LISTING_SHEET_SESSION_KEY = "houzzat:listing-sheet";

export type ListingSheetSessionRecord = {
  v: 1;
  href: string;
  browse: readonly string[] | null;
  /** Underlying page: pathname + search, so filters stay part of the match. */
  page: string;
  savedAt: number;
};

type ListingSheetStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

let persistenceBinding: {
  storage: ListingSheetStorage | null;
  pageIdentity: () => string;
} | null = null;

/** Tests supply storage and the underlying page. Production uses the window. */
export function bindListingSheetPersistenceForTest(
  binding: {
    storage: ListingSheetStorage | null;
    pageIdentity: () => string;
  } | null,
) {
  persistenceBinding = binding;
}

function listingSheetStorage(): ListingSheetStorage | null {
  if (persistenceBinding) return persistenceBinding.storage;
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function currentListingSheetPage(): string {
  if (persistenceBinding) return persistenceBinding.pageIdentity();
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}`;
}

function readListingSheetSession(): ListingSheetSessionRecord | null {
  const storage = listingSheetStorage();
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(LISTING_SHEET_SESSION_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Partial<ListingSheetSessionRecord>;
  if (record.v !== 1) return null;
  if (typeof record.href !== "string" || !record.href.startsWith("/listing/")) {
    return null;
  }
  if (typeof record.page !== "string" || record.page.length === 0) return null;
  if (typeof record.savedAt !== "number" || !Number.isFinite(record.savedAt)) {
    return null;
  }
  const browse = Array.isArray(record.browse)
    ? record.browse.filter(
        (href): href is string => typeof href === "string" && href.length > 0,
      )
    : null;
  return {
    v: 1,
    href: record.href,
    browse: browse && browse.length > 0 ? browse : null,
    page: record.page,
    savedAt: record.savedAt,
  };
}

function writeListingSheetSession(record: ListingSheetSessionRecord) {
  const storage = listingSheetStorage();
  if (!storage) return;
  try {
    storage.setItem(LISTING_SHEET_SESSION_KEY, JSON.stringify(record));
  } catch {
    // Private mode or quota — the overlay still works for this page view.
  }
  ensureHistoryPageSync();
}

/** Remember the listing currently on top, for this tab and underlying page. */
export function persistListingSheetSession(now = Date.now()) {
  const frame = stack[stack.length - 1];
  const page = currentListingSheetPage();
  if (!frame || !page) return;
  writeListingSheetSession({
    v: 1,
    href: frame.href,
    browse: frame.browse ? [...frame.browse] : null,
    page,
    savedAt: now,
  });
}

export function clearPersistedListingSheet() {
  const storage = listingSheetStorage();
  if (!storage) return;
  try {
    storage.removeItem(LISTING_SHEET_SESSION_KEY);
  } catch {
    // Ignore storage failures; the in-memory stack is already closed.
  }
}

/**
 * Keep the stored underlying page aligned when Search replaces the URL
 * (filters) while the overlay stays open.
 */
export function syncListingSheetPersistedPage() {
  if (stack.length === 0) return;
  const page = currentListingSheetPage();
  if (!page) return;
  const existing = readListingSheetSession();
  if (!existing) {
    persistListingSheetSession();
    return;
  }
  if (existing.page === page) return;
  writeListingSheetSession({ ...existing, page });
}

let historyPageSyncInstalled = false;

/**
 * Next's HistoryUpdater calls replaceState on router commits. That is also
 * when the Search URL (and therefore the underlying page identity) changes.
 */
function ensureHistoryPageSync() {
  if (historyPageSyncInstalled || persistenceBinding) return;
  if (typeof window === "undefined") return;
  historyPageSyncInstalled = true;
  const original = window.history.replaceState.bind(window.history);
  window.history.replaceState = function (
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ) {
    const result = original(data, unused, url);
    if (stack.length > 0) syncListingSheetPersistedPage();
    return result;
  };
}

/**
 * Reopen the listing stored for this tab when the reloaded URL is still the
 * underlying page and the record is inside the max age. No-ops when memory
 * already has a sheet or the record was cleared.
 */
export function restoreListingSheetFromSession(now = Date.now()): boolean {
  if (stack.length > 0) return false;
  const record = readListingSheetSession();
  if (!record) return false;
  if (now < record.savedAt) return false;
  if (now - record.savedAt > LISTING_SHEET_HISTORY_MAX_AGE_MS) return false;
  const page = currentListingSheetPage();
  if (!page || record.page !== page) return false;
  openListingSheet(record.href, record.browse);
  return sameListingHref(getListingSheetHref() ?? "", record.href);
}

/**
 * Reload drops this module. Tests use this to mimic that, without the
 * session clear that an intentional close performs.
 */
export function discardListingSheetMemoryForReload() {
  stack = [];
  emit();
}

let navigatingAway = false;

/** Close the overlay because the page is leaving for a non-listing URL. */
export function beginListingSheetNavigationAway() {
  navigatingAway = true;
  closeListingSheet();
}

/** Host reads this once when the overlay href becomes empty. */
export function consumeListingSheetNavigationAway(): boolean {
  const away = navigatingAway;
  navigatingAway = false;
  return away;
}

export function canListingSheetBack(): boolean {
  return stack.length > 1;
}

export const LISTING_SHEET_OPEN_MESSAGE = "houzzat:listing-sheet-open" as const;

/** Iframe → parent: close sheet stack and hard-navigate to a non-listing URL. */
export const LISTING_SHEET_LEAVE_MESSAGE = "houzzat:listing-sheet-leave" as const;
