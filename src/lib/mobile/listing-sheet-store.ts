/**
 * Listing detail overlay stack — browse page stays mounted underneath.
 * Back pops one listing; Close clears the whole stack.
 */

type Listener = (state: ListingSheetState) => void;

export type ListingSheetState = {
  href: string | null;
  depth: number;
  canBack: boolean;
};

let stack: string[] = [];
const listeners = new Set<Listener>();

function normalizeHref(href: string): string {
  try {
    const url = new URL(href, "https://houzzat.local");
    url.searchParams.delete("sheet");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

function snapshot(): ListingSheetState {
  const href = stack[stack.length - 1] ?? null;
  return {
    href,
    depth: stack.length,
    canBack: stack.length > 1,
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
  return stack[stack.length - 1] ?? null;
}

/** Push a listing (or no-op if it's already on top). */
export function openListingSheet(href: string) {
  const next = normalizeHref(href);
  if (!next) return;
  if (stack[stack.length - 1] === next) {
    emit();
    return;
  }
  stack = [...stack, next];
  emit();
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
