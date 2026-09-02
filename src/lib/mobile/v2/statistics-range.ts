/**
 * Stage 5.9 — Statistics date-range parsing (no Prisma).
 * Web /agent/statistics allows 7 | 30 | 90 only.
 */

export const MOBILE_STATISTICS_RANGES = [7, 30, 90] as const;
export type MobileStatisticsRange = (typeof MOBILE_STATISTICS_RANGES)[number];

export function parseMobileStatisticsRange(
  raw: string | null,
): MobileStatisticsRange | "invalid" {
  if (!raw || !raw.trim()) return 30;
  const n = Number.parseInt(raw.trim(), 10);
  if ((MOBILE_STATISTICS_RANGES as readonly number[]).includes(n)) {
    return n as MobileStatisticsRange;
  }
  return "invalid";
}
