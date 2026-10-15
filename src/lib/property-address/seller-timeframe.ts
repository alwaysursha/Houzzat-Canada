/**
 * Seller claim funnel timeframe — stored on Lead.captureContext only.
 * Never writes User.purchaseTimeframe (buyer qualification field).
 */

import type { Prisma } from "@prisma/client";
import {
  isPurchaseTimeframe,
  type PurchaseTimeframeValue,
} from "@/lib/agent/timeframe";

export type SellerTimeframeChoice =
  | PurchaseTimeframeValue
  | "JUST_EXPLORING";

/** Explicit status so exploring ≠ skipped ≠ unanswered. */
export type SellerTimeframeStatus =
  | "unanswered"
  | "answered"
  | "exploring"
  | "skipped";

export type SellerTimeframeState = {
  status: SellerTimeframeStatus;
  /** Set when answered (PurchaseTimeframe) or exploring (JUST_EXPLORING). */
  value: SellerTimeframeChoice | null;
  updatedAt: string | null;
};

export const SELLER_TIMEFRAME_OPTIONS: Array<{
  value: SellerTimeframeChoice;
  label: string;
}> = [
  { value: "NOW", label: "As soon as possible" },
  { value: "ONE_TO_THREE_MONTHS", label: "Within 3 months" },
  { value: "THREE_TO_SIX_MONTHS", label: "Within 3–6 months" },
  { value: "SIX_TO_TWELVE_MONTHS", label: "Within 6–12 months" },
  { value: "TWELVE_PLUS_MONTHS", label: "More than a year" },
  { value: "JUST_EXPLORING", label: "Just exploring my options" },
];

export function sellerTimeframeLabel(
  value: SellerTimeframeChoice | null | undefined,
): string | null {
  if (!value) return null;
  const hit = SELLER_TIMEFRAME_OPTIONS.find((o) => o.value === value);
  return hit?.label ?? null;
}

export function parseSellerTimeframeChoice(
  value: unknown,
): SellerTimeframeChoice | null {
  if (value === "JUST_EXPLORING") return "JUST_EXPLORING";
  if (isPurchaseTimeframe(value)) return value;
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}

function parseStatus(raw: unknown): SellerTimeframeStatus | null {
  if (
    raw === "unanswered" ||
    raw === "answered" ||
    raw === "exploring" ||
    raw === "skipped"
  ) {
    return raw;
  }
  return null;
}

/** Read durable seller timeframe from Lead.captureContext (tenant-scoped via Lead). */
export function readSellerTimeframeState(
  captureContext: unknown,
): SellerTimeframeState | null {
  const ctx = asRecord(captureContext);
  const status = parseStatus(ctx.sellingTimeframeStatus);
  if (!status) {
    // Legacy activity-only exploring marker from early 3B — treat as exploring.
    if (ctx.sellingExploring === true) {
      return {
        status: "exploring",
        value: "JUST_EXPLORING",
        updatedAt:
          typeof ctx.sellingTimeframeUpdatedAt === "string"
            ? ctx.sellingTimeframeUpdatedAt
            : null,
      };
    }
    return null;
  }
  const value = parseSellerTimeframeChoice(ctx.sellingTimeframe);
  return {
    status,
    value:
      status === "exploring"
        ? "JUST_EXPLORING"
        : status === "answered"
          ? value
          : null,
    updatedAt:
      typeof ctx.sellingTimeframeUpdatedAt === "string"
        ? ctx.sellingTimeframeUpdatedAt
        : null,
  };
}

export function formatSellerTimeframeState(
  state: SellerTimeframeState | null | undefined,
): string | null {
  if (!state) return null;
  switch (state.status) {
    case "unanswered":
      return null;
    case "skipped":
      return "Skipped";
    case "exploring":
      return sellerTimeframeLabel("JUST_EXPLORING");
    case "answered":
      return sellerTimeframeLabel(state.value);
    default: {
      const _exhaustive: never = state.status;
      return _exhaustive;
    }
  }
}

export type SellerTimeframeWrite =
  | { kind: "answered"; value: PurchaseTimeframeValue }
  | { kind: "exploring" }
  | { kind: "skipped" };

/** Merge seller timeframe into captureContext without touching buyer fields. */
export function mergeSellerTimeframeIntoCapture(
  captureContext: Prisma.JsonValue | null | undefined,
  write: SellerTimeframeWrite,
  now: Date = new Date(),
): Record<string, unknown> {
  const prev = asRecord(captureContext);
  const updatedAt = now.toISOString();
  switch (write.kind) {
    case "answered":
      return {
        ...prev,
        sellingTimeframeStatus: "answered" satisfies SellerTimeframeStatus,
        sellingTimeframe: write.value,
        sellingTimeframeUpdatedAt: updatedAt,
        sellingExploring: false,
      };
    case "exploring":
      return {
        ...prev,
        sellingTimeframeStatus: "exploring" satisfies SellerTimeframeStatus,
        sellingTimeframe: "JUST_EXPLORING",
        sellingTimeframeUpdatedAt: updatedAt,
        sellingExploring: true,
      };
    case "skipped":
      return {
        ...prev,
        sellingTimeframeStatus: "skipped" satisfies SellerTimeframeStatus,
        sellingTimeframe: null,
        sellingTimeframeUpdatedAt: updatedAt,
        sellingExploring: false,
      };
    default: {
      const _exhaustive: never = write;
      return _exhaustive;
    }
  }
}
