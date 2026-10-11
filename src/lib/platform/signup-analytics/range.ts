import { SIGNUP_ANALYTICS_TIME_ZONE } from "@/lib/platform/signup-analytics/constants";

export type SignupAnalyticsPreset = "today" | "7d" | "30d" | "custom" | "all";

/** Maximum inclusive calendar span for custom ranges (All-time is unrestricted). */
export const SIGNUP_ANALYTICS_MAX_CUSTOM_RANGE_DAYS = 366;

export type SignupAnalyticsRange = {
  preset: SignupAnalyticsPreset;
  /** Inclusive start instant (UTC). Null = unbounded past. */
  from: Date | null;
  /** Exclusive end instant (UTC). Null = unbounded future (use now). */
  to: Date;
  timeZone: string;
};

export class SignupAnalyticsRangeError extends Error {
  readonly status = 400;
  readonly code = "DATE_RANGE_TOO_LARGE";

  constructor(
    message = `Custom date range cannot exceed ${SIGNUP_ANALYTICS_MAX_CUSTOM_RANGE_DAYS} days. Narrow the range or use All time.`,
  ) {
    super(message);
    this.name = "SignupAnalyticsRangeError";
  }
}

/**
 * Convert a calendar YYYY-MM-DD in `timeZone` to the UTC instant of local midnight.
 */
export function zonedDayStartUtc(
  year: number,
  month: number,
  day: number,
  timeZone: string = SIGNUP_ANALYTICS_TIME_ZONE,
): Date {
  // Binary search UTC ms that formats as the target local date at 00:00.
  const target = `${year}-${pad(month)}-${pad(day)}`;
  let lo = Date.UTC(year, month - 1, day) - 36 * 3600 * 1000;
  let hi = Date.UTC(year, month - 1, day) + 36 * 3600 * 1000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const local = formatYmdInZone(new Date(mid), timeZone);
    if (local < target) lo = mid + 1;
    else hi = mid;
  }
  // Walk back to the first ms of that local day.
  let start = lo;
  while (start > 0 && formatYmdInZone(new Date(start - 1), timeZone) === target) {
    start -= 1;
  }
  return new Date(start);
}

export function addZonedDays(start: Date, days: number, timeZone: string): Date {
  const ymd = formatYmdInZone(start, timeZone);
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const asUtcNoon = Date.UTC(y, m - 1, d, 12, 0, 0);
  const shifted = new Date(asUtcNoon + days * 86400000);
  const next = formatYmdInZone(shifted, timeZone);
  const [ny, nm, nd] = next.split("-").map(Number) as [number, number, number];
  return zonedDayStartUtc(ny, nm, nd, timeZone);
}

export function formatYmdInZone(
  instant: Date,
  timeZone: string = SIGNUP_ANALYTICS_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function resolveSignupAnalyticsRange(input: {
  preset?: string | null;
  from?: string | null;
  to?: string | null;
  now?: Date;
  timeZone?: string;
}): SignupAnalyticsRange {
  const timeZone = input.timeZone?.trim() || SIGNUP_ANALYTICS_TIME_ZONE;
  const now = input.now ?? new Date();
  const todayYmd = formatYmdInZone(now, timeZone);
  const [ty, tm, td] = todayYmd.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const todayStart = zonedDayStartUtc(ty, tm, td, timeZone);
  const tomorrowStart = addZonedDays(todayStart, 1, timeZone);

  const presetRaw = (input.preset ?? "30d").trim().toLowerCase();
  const preset: SignupAnalyticsPreset =
    presetRaw === "today" ||
    presetRaw === "7d" ||
    presetRaw === "30d" ||
    presetRaw === "custom" ||
    presetRaw === "all"
      ? presetRaw
      : "30d";

  if (preset === "all") {
    return { preset, from: null, to: tomorrowStart, timeZone };
  }
  if (preset === "today") {
    return { preset, from: todayStart, to: tomorrowStart, timeZone };
  }
  if (preset === "7d") {
    return {
      preset,
      from: addZonedDays(todayStart, -6, timeZone),
      to: tomorrowStart,
      timeZone,
    };
  }
  if (preset === "30d") {
    return {
      preset,
      from: addZonedDays(todayStart, -29, timeZone),
      to: tomorrowStart,
      timeZone,
    };
  }

  // custom
  const fromYmd = parseYmd(input.from);
  const toYmd = parseYmd(input.to) ?? { y: ty, m: tm, d: td };
  if (!fromYmd) {
    return {
      preset: "30d",
      from: addZonedDays(todayStart, -29, timeZone),
      to: tomorrowStart,
      timeZone,
    };
  }
  let from = zonedDayStartUtc(fromYmd.y, fromYmd.m, fromYmd.d, timeZone);
  let toExclusive = addZonedDays(
    zonedDayStartUtc(toYmd.y, toYmd.m, toYmd.d, timeZone),
    1,
    timeZone,
  );
  if (from.getTime() > toExclusive.getTime()) {
    const tmp = from;
    from = addZonedDays(toExclusive, -1, timeZone);
    toExclusive = addZonedDays(tmp, 1, timeZone);
  }
  const maxSpanMs = SIGNUP_ANALYTICS_MAX_CUSTOM_RANGE_DAYS * 86400000;
  if (toExclusive.getTime() - from.getTime() > maxSpanMs) {
    throw new SignupAnalyticsRangeError();
  }
  return { preset: "custom", from, to: toExclusive, timeZone };
}

function parseYmd(
  value: string | null | undefined,
): { y: number; m: number; d: number } | null {
  const raw = value?.trim() ?? "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Enumerate local YYYY-MM-DD labels from fromInclusive..toExclusive. */
export function enumerateZonedDays(
  from: Date,
  toExclusive: Date,
  timeZone: string,
): string[] {
  const days: string[] = [];
  let cursor = from;
  const guard = 400;
  for (let i = 0; i < guard && cursor.getTime() < toExclusive.getTime(); i++) {
    days.push(formatYmdInZone(cursor, timeZone));
    cursor = addZonedDays(cursor, 1, timeZone);
  }
  return days;
}
