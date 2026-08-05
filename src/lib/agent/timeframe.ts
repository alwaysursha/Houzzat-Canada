import type { PurchaseTimeframe } from "@prisma/client";

export const PURCHASE_TIMEFRAMES = [
  "NOW",
  "ONE_TO_THREE_MONTHS",
  "SIX_TO_TWELVE_MONTHS",
  "TWELVE_PLUS_MONTHS",
] as const satisfies readonly PurchaseTimeframe[];

export type PurchaseTimeframeValue = (typeof PURCHASE_TIMEFRAMES)[number];

const LABELS: Record<PurchaseTimeframeValue, string> = {
  NOW: "Now",
  ONE_TO_THREE_MONTHS: "1–3 months",
  SIX_TO_TWELVE_MONTHS: "6–12 months",
  TWELVE_PLUS_MONTHS: "12+ months",
};

const SORT_ORDER: Record<PurchaseTimeframeValue, number> = {
  NOW: 0,
  ONE_TO_THREE_MONTHS: 1,
  SIX_TO_TWELVE_MONTHS: 2,
  TWELVE_PLUS_MONTHS: 3,
};

export function purchaseTimeframeLabel(
  value: PurchaseTimeframe | string | null | undefined,
): string | null {
  if (!value) return null;
  if (value in LABELS) return LABELS[value as PurchaseTimeframeValue];
  return null;
}

export function purchaseTimeframeSortKey(
  value: PurchaseTimeframe | string | null | undefined,
): number {
  if (!value || !(value in SORT_ORDER)) return 99;
  return SORT_ORDER[value as PurchaseTimeframeValue];
}

export function isPurchaseTimeframe(
  value: unknown,
): value is PurchaseTimeframeValue {
  return (
    typeof value === "string" &&
    (PURCHASE_TIMEFRAMES as readonly string[]).includes(value)
  );
}
