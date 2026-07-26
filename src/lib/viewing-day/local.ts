/** Guest Viewing day bucket — localStorage until sign-in. */

const STORAGE_KEY = "houzzat:viewing-day";

export type LocalViewingDay = {
  mlsNumbers: string[];
  startAddress?: string | null;
  startLat?: number | null;
  startLng?: number | null;
  /** ISO string */
  startAt?: string | null;
  defaultDwellMinutes?: number;
  bufferMinutes?: number;
};

export function loadLocalViewingDay(): LocalViewingDay {
  if (typeof window === "undefined") {
    return { mlsNumbers: [] };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { mlsNumbers: [] };
    const parsed = JSON.parse(raw) as LocalViewingDay;
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

export function saveLocalViewingDay(day: LocalViewingDay) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(day));
  window.dispatchEvent(new Event("houzzat:viewing-day-changed"));
}

export function clearLocalViewingDay() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event("houzzat:viewing-day-changed"));
}

export function toggleLocalStop(mlsNumber: string, maxStops: number) {
  const day = loadLocalViewingDay();
  const has = day.mlsNumbers.includes(mlsNumber);
  if (has) {
    day.mlsNumbers = day.mlsNumbers.filter((m) => m !== mlsNumber);
  } else {
    if (day.mlsNumbers.length >= maxStops) {
      return { ok: false as const, day, reason: "max" as const };
    }
    day.mlsNumbers = [...day.mlsNumbers, mlsNumber];
  }
  saveLocalViewingDay(day);
  return { ok: true as const, day, added: !has };
}
