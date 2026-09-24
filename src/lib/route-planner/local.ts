/** Guest Route Planner bucket — localStorage until sign-in. */

import { notifyRoutePlannerChanged } from "@/lib/route-planner/route-planner-sync";

const STORAGE_KEY = "houzzat:route-planner";
const LEGACY_STORAGE_KEY = "houzzat:viewing-day";

export type LocalRoutePlanner = {
  mlsNumbers: string[];
  startAddress?: string | null;
  startLat?: number | null;
  startLng?: number | null;
  /** ISO string */
  startAt?: string | null;
  defaultDwellMinutes?: number;
  bufferMinutes?: number;
};

function parseStored(raw: string | null): LocalRoutePlanner {
  if (!raw) return { mlsNumbers: [] };
  try {
    const parsed = JSON.parse(raw) as LocalRoutePlanner;
    return {
      mlsNumbers: Array.isArray(parsed.mlsNumbers)
        ? parsed.mlsNumbers.filter((x) => typeof x === "string")
        : [],
      startAddress: parsed.startAddress ?? null,
      startLat: parsed.startLat ?? null,
      startLng: parsed.startLng ?? null,
      startAt: parsed.startAt ?? null,
      defaultDwellMinutes: parsed.defaultDwellMinutes,
      bufferMinutes: parsed.bufferMinutes,
    };
  } catch {
    return { mlsNumbers: [] };
  }
}

export function loadLocalRoutePlanner(): LocalRoutePlanner {
  if (typeof window === "undefined") {
    return { mlsNumbers: [] };
  }
  const current = window.localStorage.getItem(STORAGE_KEY);
  if (current) return parseStored(current);

  // One-time migrate from the old Viewing day key
  const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacy) {
    const parsed = parseStored(legacy);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    return parsed;
  }

  return { mlsNumbers: [] };
}

export function saveLocalRoutePlanner(day: LocalRoutePlanner) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(day));
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  notifyRoutePlannerChanged();
}

export function clearLocalRoutePlanner() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  notifyRoutePlannerChanged();
}

export function toggleLocalStop(mlsNumber: string, maxStops: number) {
  const day = loadLocalRoutePlanner();
  const has = day.mlsNumbers.includes(mlsNumber);
  if (has) {
    day.mlsNumbers = day.mlsNumbers.filter((m) => m !== mlsNumber);
  } else {
    if (day.mlsNumbers.length >= maxStops) {
      return { ok: false as const, day, reason: "max" as const };
    }
    day.mlsNumbers = [...day.mlsNumbers, mlsNumber];
  }
  saveLocalRoutePlanner(day);
  return { ok: true as const, day, added: !has };
}
