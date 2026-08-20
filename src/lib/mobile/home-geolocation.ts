import {
  getCurrentCoordinates,
  type GeoCoords,
} from "@/lib/mobile/geolocation";
import {
  NORMAL_LOCATION_MAX_AGE_MS,
  NORMAL_LOCATION_TIMEOUT_MS,
} from "@/lib/mobile/location-policy";

export const HOME_GEO_STORAGE_KEY = "houzzat-region-geo";
export const HOME_GEO_EVENT = "houzzat:geo";

/** Shared coarse-location TTL for Home + Search Near Me. */
export const NORMAL_LOCATION_MAX_AGE = NORMAL_LOCATION_MAX_AGE_MS;
export const NORMAL_LOCATION_TIMEOUT = NORMAL_LOCATION_TIMEOUT_MS;

type CachedHomeGeo = {
  lat: number;
  lng: number;
  at: number;
};

type GetCoordsFn = typeof getCurrentCoordinates;

let memory: CachedHomeGeo | null = null;
let inflight: Promise<GeoCoords> | null = null;
/** Tracks whether the in-flight op was allowed to prompt (for joiners). */
let inflightRequestsPermission = false;
let getCoordsImpl: GetCoordsFn = getCurrentCoordinates;

function isFresh(entry: CachedHomeGeo, maximumAge: number): boolean {
  return Date.now() - entry.at <= maximumAge;
}

function readSessionCache(): CachedHomeGeo | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(HOME_GEO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      lat?: number;
      lng?: number;
      at?: number;
    };
    if (!Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lng)) {
      return null;
    }
    return {
      lat: parsed.lat as number,
      lng: parsed.lng as number,
      // Older writers omitted `at` — treat as fresh for this session.
      at: Number.isFinite(parsed.at) ? (parsed.at as number) : Date.now(),
    };
  } catch {
    return null;
  }
}

function writeSessionCache(coords: GeoCoords) {
  const entry: CachedHomeGeo = { ...coords, at: Date.now() };
  memory = entry;
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(HOME_GEO_STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // ignore quota / private mode
  }
}

/** Sync read of the latest app geo (memory or sessionStorage). */
export function readCachedHomeCoordinates(
  maximumAge = NORMAL_LOCATION_MAX_AGE,
): GeoCoords | null {
  if (memory && isFresh(memory, maximumAge)) {
    return { lat: memory.lat, lng: memory.lng };
  }
  const session = readSessionCache();
  if (session && isFresh(session, maximumAge)) {
    memory = session;
    return { lat: session.lat, lng: session.lng };
  }
  return null;
}

/**
 * Single-flight consumer geolocation for Home Near Me, market rails, Search.
 * Coarse accuracy only — no continuous tracking.
 *
 * `requestPermission` defaults to **false** so Home effects never open the OS
 * dialog. Pass `true` only from an explicit user tap (Near Me CTA).
 */
export async function getHomeCoordinates(options?: {
  timeout?: number;
  maximumAge?: number;
  /** When false, skip the `houzzat:geo` broadcast. Default true. */
  emitEvent?: boolean;
  /**
   * When true, may show the OS/browser permission dialog.
   * Default false — safe for passive Home / rails code.
   */
  requestPermission?: boolean;
}): Promise<GeoCoords> {
  const maximumAge = options?.maximumAge ?? NORMAL_LOCATION_MAX_AGE;
  const timeout = options?.timeout ?? NORMAL_LOCATION_TIMEOUT;
  const emitEvent = options?.emitEvent !== false;
  const requestPermission = options?.requestPermission === true;

  const cached = readCachedHomeCoordinates(maximumAge);
  if (cached) return cached;

  // Join an existing in-flight only when it already covers our permission need
  // (or we also don't need to prompt).
  if (inflight && (inflightRequestsPermission || !requestPermission)) {
    return inflight;
  }

  inflightRequestsPermission = requestPermission;
  inflight = (async () => {
    const coords = await getCoordsImpl({
      enableHighAccuracy: false,
      timeout,
      maximumAge,
      requestPermission,
    });
    writeSessionCache(coords);
    if (emitEvent && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(HOME_GEO_EVENT, {
          detail: { lat: coords.lat, lng: coords.lng },
        }),
      );
    }
    return coords;
  })().finally(() => {
    inflight = null;
    inflightRequestsPermission = false;
  });

  return inflight;
}

/** Alias — same shared coordinator. Prefer this name in new call sites. */
export const getAppCoordinates = getHomeCoordinates;

/** Test helper — reset module cache / in-flight. */
export function __resetHomeGeolocationForTests(): void {
  memory = null;
  inflight = null;
  inflightRequestsPermission = false;
  getCoordsImpl = getCurrentCoordinates;
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.removeItem(HOME_GEO_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

/** Test helper — inject GPS implementation. */
export function __setGetCurrentCoordinatesForTests(fn: GetCoordsFn): void {
  getCoordsImpl = fn;
}
