/**
 * Listing detail overlay stack — browse page stays mounted underneath.
 * Back pops one listing; Close clears the whole stack.
 */

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
  if (!out.includes(current)) return null;
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
  const index = frame.browse.indexOf(frame.href);
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
    emit();
    return;
  }
  stack = [
    ...stack,
    { href: next, browse: normalizeBrowse(browse, next) },
  ];
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
  if (!top.browse.includes(next)) return false;
  if (top.href === next) return true;
  stack = [...stack.slice(0, -1), { href: next, browse: top.browse }];
  emit();
  return true;
}

/** Pop one listing. Closes the sheet when the stack is empty. */
export function backListingSheet(): boolean {
  if (stack.length === 0) return false;
  if (stack.length === 1) {
    stack = [];
    emit();
    return false;
  }
  stack = stack.slice(0, -1);
  emit();
  return true;
}

/** Dismiss the overlay and clear every listing in the stack. */
export function closeListingSheet() {
  if (stack.length === 0) return;
  stack = [];
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

export function canListingSheetBack(): boolean {
  return stack.length > 1;
}

export const LISTING_SHEET_OPEN_MESSAGE = "houzzat:listing-sheet-open" as const;

/** Iframe → parent: close sheet stack and hard-navigate to a non-listing URL. */
export const LISTING_SHEET_LEAVE_MESSAGE = "houzzat:listing-sheet-leave" as const;
