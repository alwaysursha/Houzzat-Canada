import { responseRequiresEmailVerification } from "@/lib/account/customer-access-error";
import {
  requireAuthForIntent,
  type CaptureIntent,
  type CaptureIntentStore,
} from "@/lib/auth/capture-intent";
import { registerCaptureIntentHandler } from "@/lib/auth/capture-intent-dispatch";
import { searchFiltersFromHref } from "@/lib/listings/search-page-href";
import {
  savedSearchDisplayName,
  searchFiltersToSavedQuery,
} from "@/lib/listings/saved-search-query";
import { createPrimarySavedSearch } from "@/lib/listings/save-primary-search";

type OpenAuth = (options: {
  mode?: "sign-in" | "sign-up";
  callbackUrl: string;
}) => void;

export const SAVED_SEARCH_NEEDS_CONFIRM_EVENT =
  "houzzat:saved-search-needs-confirm";

const SAVED_SEARCH_CONFIRM_KEY = "houzzat:saved-search-needs-confirm";

const SAVED_SEARCHES_CHANGED_EVENT = "houzzat:saved-searches-changed";

/**
 * Anonymous Save Search. The callback path is the full /search URL.
 * Signed-in saves do not call this.
 */
export function openGuestSaveSearchIntent(input: {
  callbackPath: string;
  host: string;
  now: number;
  store: CaptureIntentStore;
  openAuth: OpenAuth;
}):
  | { ok: true; intent: CaptureIntent }
  | { ok: false; reason: "invalid" } {
  return requireAuthForIntent({
    draft: {
      type: "SAVE_SEARCH",
      callbackPath: input.callbackPath,
    },
    host: input.host,
    now: input.now,
    store: input.store,
    openAuth: input.openAuth,
    mode: "sign-in",
  });
}

export function stableSavedSearchQueryKey(query: Record<string, unknown>): string {
  const cleaned: Record<string, unknown> = {};
  for (const key of Object.keys(query).sort()) {
    const value = query[key];
    if (value == null || value === "") continue;
    cleaned[key] = value;
  }
  return JSON.stringify(cleaned);
}

/**
 * Rebuild the existing SavedSearch name and query from the search page URL.
 * View, map bounds, and free-text `q` stay on the URL and are not copied
 * into the saved query, matching the current save button.
 */
export function savedSearchPayloadFromCallback(callbackPath: string): {
  name: string;
  query: Record<string, unknown>;
} | null {
  const filters = searchFiltersFromHref(callbackPath);
  if (!filters) return null;
  return {
    name: savedSearchDisplayName(filters),
    query: searchFiltersToSavedQuery(filters),
  };
}

type SavedSearchRow = {
  query?: Record<string, unknown> | null;
  isPrimary?: boolean;
};

export type ResumeSavedSearchResult =
  | "saved"
  | "needs_confirm"
  | "verification"
  | "failed"
  | "ignored";

type SavedSearchCallResult = { ok: boolean; verification?: boolean };

function notifySavedSearchesChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SAVED_SEARCHES_CHANGED_EVENT));
}

function requestSavedSearchConfirm(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SAVED_SEARCH_CONFIRM_KEY, "1");
  } catch {
    // private mode
  }
  window.dispatchEvent(new Event(SAVED_SEARCH_NEEDS_CONFIRM_EVENT));
}

export function readSavedSearchConfirm(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(SAVED_SEARCH_CONFIRM_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearSavedSearchConfirm(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SAVED_SEARCH_CONFIRM_KEY);
  } catch {
    // private mode
  }
}

async function listSavedSearches(): Promise<
  | { ok: true; items: SavedSearchRow[] }
  | { ok: false; verification: boolean }
> {
  const res = await fetch("/api/saved-searches", { credentials: "same-origin" });
  if (!res.ok) {
    return {
      ok: false,
      verification: await responseRequiresEmailVerification(res),
    };
  }
  const data = (await res.json()) as { items?: SavedSearchRow[] };
  return { ok: true, items: data.items ?? [] };
}

async function createSavedSearch(input: {
  name: string;
  query: Record<string, unknown>;
}): Promise<SavedSearchCallResult> {
  const outcome = await createPrimarySavedSearch(input);
  if (outcome.status === "saved") return { ok: true };
  return {
    ok: false,
    verification: outcome.status === "error" && outcome.verification === true,
  };
}

/**
 * Resume SAVE_SEARCH through the existing saved-search API.
 * An already-matching primary search completes without another row.
 * A different existing search asks for the current replace confirmation
 * and does not write until the visitor confirms.
 */
export async function resumeSavedSearchIntent(
  intent: CaptureIntent,
  deps: {
    list?: () => Promise<
      | { ok: true; items: SavedSearchRow[] }
      | { ok: false; verification?: boolean }
    >;
    create?: (input: {
      name: string;
      query: Record<string, unknown>;
    }) => Promise<SavedSearchCallResult>;
    onSaved?: () => void;
    onNeedsConfirm?: () => void;
  } = {},
): Promise<ResumeSavedSearchResult> {
  if (intent.type !== "SAVE_SEARCH") return "ignored";
  const payload = savedSearchPayloadFromCallback(intent.callbackPath);
  if (!payload) return "failed";
  const list = deps.list ?? listSavedSearches;
  const create = deps.create ?? createSavedSearch;
  const onSaved = deps.onSaved ?? notifySavedSearchesChanged;
  const onNeedsConfirm = deps.onNeedsConfirm ?? requestSavedSearchConfirm;
  try {
    const listed = await list();
    if (!listed.ok) {
      if (listed.verification) return "verification";
      return "failed";
    }
    const primary =
      listed.items.find((item) => item.isPrimary) ?? listed.items[0] ?? null;
    if (
      primary?.query &&
      stableSavedSearchQueryKey(primary.query) ===
        stableSavedSearchQueryKey(payload.query)
    ) {
      onSaved();
      return "saved";
    }
    if (listed.items.length > 0) {
      onNeedsConfirm();
      return "needs_confirm";
    }
    const created = await create(payload);
    if (!created.ok) {
      if (created.verification) return "verification";
      return "failed";
    }
    onSaved();
    return "saved";
  } catch {
    return "failed";
  }
}

let retains = 0;
let stopHandler: (() => void) | null = null;
let announceSaved: (() => void) | null = null;
let announceFailed: (() => void) | null = null;
let announceVerification: (() => void) | null = null;

/** Keep SAVE_SEARCH registered while a save-search control is mounted. */
export function retainSaveSearchIntentHandler(input: {
  onSaved: () => void;
  onFailed: () => void;
  onVerification?: () => void;
}): () => void {
  announceSaved = input.onSaved;
  announceFailed = input.onFailed;
  announceVerification = input.onVerification ?? null;
  retains += 1;
  if (retains === 1) {
    stopHandler = registerCaptureIntentHandler("SAVE_SEARCH", (intent) => {
      void resumeSavedSearchIntent(intent).then((result) => {
        if (result === "saved") announceSaved?.();
        else if (result === "verification") announceVerification?.();
        else if (result === "failed") announceFailed?.();
      });
    });
  }
  return () => {
    retains -= 1;
    if (retains === 0) {
      stopHandler?.();
      stopHandler = null;
      announceSaved = null;
      announceFailed = null;
      announceVerification = null;
    }
  };
}
