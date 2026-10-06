/**
 * First-party capture attribution for consumer signup.
 * Never invent Google campaign/ad/keyword names.
 */

import type { CaptureIntentType } from "@/lib/auth/capture-intent";

export type CaptureClickIds = {
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
};

export type CaptureContext = {
  intent?: CaptureIntentType | null;
  mlsNumber?: string | null;
  listingAddress?: string | null;
  listingPrice?: number | null;
  pathname?: string | null;
  callbackUrl?: string | null;
  searchUrl?: string | null;
  searchFilters?: Record<string, unknown> | null;
  visitorKey?: string | null;
  sessionKey?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  adCampaignId?: string | null;
  landingPageId?: string | null;
  referrer?: string | null;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  capturedAt?: string;
};

const CLICK_ID_STORAGE_KEY = "houzzat_click_ids";

export function pickClickIds(
  input: Record<string, unknown> | null | undefined,
): CaptureClickIds {
  if (!input) return {};
  const str = (key: string) => {
    const v = input[key];
    return typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : undefined;
  };
  return {
    gclid: str("gclid"),
    gbraid: str("gbraid"),
    wbraid: str("wbraid"),
  };
}

export function readClickIdsFromSearchParams(
  params: URLSearchParams,
): CaptureClickIds {
  return {
    gclid: params.get("gclid") ?? undefined,
    gbraid: params.get("gbraid") ?? undefined,
    wbraid: params.get("wbraid") ?? undefined,
  };
}

export function persistClickIds(ids: CaptureClickIds): void {
  if (typeof window === "undefined") return;
  if (!ids.gclid && !ids.gbraid && !ids.wbraid) return;
  try {
    const prev = loadPersistedClickIds();
    sessionStorage.setItem(
      CLICK_ID_STORAGE_KEY,
      JSON.stringify({ ...prev, ...ids }),
    );
  } catch {
    /* ignore */
  }
}

export function loadPersistedClickIds(): CaptureClickIds {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(CLICK_ID_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as CaptureClickIds;
  } catch {
    return {};
  }
}

export function buildCaptureContext(
  input: Partial<CaptureContext> & { now?: Date },
): CaptureContext {
  const now = input.now ?? new Date();
  const clean = (v: string | null | undefined, max = 500) => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t ? t.slice(0, max) : null;
  };
  return {
    intent: input.intent ?? null,
    mlsNumber: clean(input.mlsNumber, 40)?.toUpperCase() ?? null,
    listingAddress: clean(input.listingAddress, 300),
    listingPrice:
      typeof input.listingPrice === "number" && Number.isFinite(input.listingPrice)
        ? input.listingPrice
        : null,
    pathname: clean(input.pathname, 500),
    callbackUrl: clean(input.callbackUrl, 800),
    searchUrl: clean(input.searchUrl, 800),
    searchFilters:
      input.searchFilters && typeof input.searchFilters === "object"
        ? input.searchFilters
        : null,
    visitorKey: clean(input.visitorKey, 120),
    sessionKey: clean(input.sessionKey, 120),
    utmSource: clean(input.utmSource, 120),
    utmMedium: clean(input.utmMedium, 120),
    utmCampaign: clean(input.utmCampaign, 160),
    utmContent: clean(input.utmContent, 160),
    adCampaignId: clean(input.adCampaignId, 120),
    landingPageId: clean(input.landingPageId, 120),
    referrer: clean(input.referrer, 1000),
    gclid: clean(input.gclid, 200),
    gbraid: clean(input.gbraid, 200),
    wbraid: clean(input.wbraid, 200),
    capturedAt: now.toISOString(),
  };
}
