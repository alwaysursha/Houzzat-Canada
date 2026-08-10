/**
 * Capacitor listing overlay — keep the underlying page mounted so Back
 * only dismisses the sheet (no soft-nav / Worker re-render of homepage).
 */

type Listener = (href: string | null) => void;

let currentHref: string | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(currentHref);
}

export function getListingSheetHref(): string | null {
  return currentHref;
}

export function openListingSheet(href: string) {
  currentHref = href;
  emit();
}

export function closeListingSheet() {
  if (currentHref == null) return;
  currentHref = null;
  emit();
}

export function subscribeListingSheet(listener: Listener): () => void {
  listeners.add(listener);
  listener(currentHref);
  return () => {
    listeners.delete(listener);
  };
}

export function isListingSheetOpen(): boolean {
  return currentHref != null;
}
