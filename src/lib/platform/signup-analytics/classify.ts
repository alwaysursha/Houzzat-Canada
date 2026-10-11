import type { Role } from "@prisma/client";
import {
  SIGNUP_ANALYTICS_CONSUMER_ROLES,
  type SignupAcquisitionChannel,
} from "@/lib/platform/signup-analytics/constants";

export type SignupAttributionSignals = {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
};

/** Pure: consumer role gate used in SQL and tests. */
export function isConsumerSignupRole(role: Role | string): boolean {
  return (SIGNUP_ANALYTICS_CONSUMER_ROLES as readonly string[]).includes(role);
}

/**
 * Pure: classify acquisition from stored UTM / click-ID signals only.
 * Does not use Lead.source=SIGNUP (that is not an ad channel).
 */
export function classifySignupAcquisition(
  signals: SignupAttributionSignals | null | undefined,
): SignupAcquisitionChannel {
  if (!signals) return "unknown";

  const gclid = trimLower(signals.gclid);
  const gbraid = trimLower(signals.gbraid);
  const wbraid = trimLower(signals.wbraid);
  if (gclid || gbraid || wbraid) return "google_ads";

  const source = trimLower(signals.utmSource);
  const medium = trimLower(signals.utmMedium);

  if (!source && !medium) return "unknown";

  if (
    medium === "cpc" ||
    medium === "ppc" ||
    medium === "paid" ||
    medium === "paidsearch" ||
    medium === "paid-search"
  ) {
    if (source.includes("google") || source === "adwords" || source === "ads") {
      return "google_ads";
    }
    // Paid non-Google — not in the supported channel set.
    return "unknown";
  }

  if (medium === "organic") return "organic";

  if (
    medium === "social" ||
    medium === "social-network" ||
    medium === "social-media" ||
    source === "facebook" ||
    source === "instagram" ||
    source === "linkedin" ||
    source === "twitter" ||
    source === "x" ||
    source === "tiktok" ||
    source === "meta"
  ) {
    return "social";
  }

  if (medium === "referral" || source === "referral") return "referral";

  if (source === "direct" || medium === "direct" || medium === "(none)") {
    return "direct";
  }

  return "unknown";
}

export function extractAttributionFromCaptureContext(
  captureContext: unknown,
): Pick<SignupAttributionSignals, "gclid" | "gbraid" | "wbraid"> {
  if (!captureContext || typeof captureContext !== "object" || Array.isArray(captureContext)) {
    return {};
  }
  const ctx = captureContext as Record<string, unknown>;
  return {
    gclid: typeof ctx.gclid === "string" ? ctx.gclid : null,
    gbraid: typeof ctx.gbraid === "string" ? ctx.gbraid : null,
    wbraid: typeof ctx.wbraid === "string" ? ctx.wbraid : null,
  };
}

function trimLower(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}
