import {
  getCurrentCoordinates,
  type GeoCoords,
} from "@/lib/mobile/geolocation";

export const HOME_GEO_STORAGE_KEY = "houzzat-region-geo";
export const HOME_GEO_EVENT = "houzzat:geo";

type CachedHomeGeo = {
  lat: number;
  lng: number;
  at: number;
};

let memory: CachedHomeGeo | null = null;
let inflight: Promise<GeoCoords> | null = null;

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

/** Sync read of the latest Home geo (memory or sessionStorage). */
export function readCachedHomeCoordinates(
  maximumAge = 300_000,
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
 * Single-flight Home geolocation for Near Me + market rails.
 * Coarse accuracy only — no continuous tracking.
 */
export async function getHomeCoordinates(options?: {
  timeout?: number;
  maximumAge?: number;
  /** When false, skip the `houzzat:geo` broadcast (caller will emit). */
  emitEvent?: boolean;
}): Promise<GeoCoords> {
  const maximumAge = options?.maximumAge ?? 300_000;
  const timeout = options?.timeout ?? 12_000;
  const emitEvent = options?.emitEvent !== false;

  const cached = readCachedHomeCoordinates(maximumAge);
  if (cached) return cached;

  if (inflight) return inflight;

  inflight = (async () => {
    const coords = await getCurrentCoordinates({
      enableHighAccuracy: false,
      timeout,
      maximumAge,
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
  });

  return inflight;
}
