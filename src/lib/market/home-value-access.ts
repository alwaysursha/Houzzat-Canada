/**
 * Home Valuation access classification (UX / disclosure only).
 * Does not change sold-comp estimate math.
 *
 * Aggregate sold-derived ranges stay behind hasClientAccess (VOW / client
 * policy) — same gate as listing-insights restricted dollars.
 */

import {
  resolveClientAccess,
  type AccessUser,
  type ClientAccessKind,
  type ResolvedClientAccess,
} from "@/lib/account-access";

export type ValuationAccessStatus =
  | "OK"
  | "INSUFFICIENT_DATA"
  | "AUTH_REQUIRED"
  | "EMAIL_VERIFY_REQUIRED";

export type ValuationAccessDenial = {
  status: "AUTH_REQUIRED" | "EMAIL_VERIFY_REQUIRED";
  accessKind: ClientAccessKind;
  message: string;
};

export function resolveValuationClientAccess(
  user: AccessUser | null | undefined,
): ResolvedClientAccess {
  return resolveClientAccess(user);
}

/**
 * When the caller is not allowed to see sold-derived dollars, return the
 * precise gate status. Authorized callers get null.
 */
export function valuationSoldAccessDenial(
  user: AccessUser | null | undefined,
): ValuationAccessDenial | null {
  const access = resolveValuationClientAccess(user);
  if (access.hasClientAccess) return null;
  if (access.needsEmailVerification) {
    return {
      status: "EMAIL_VERIFY_REQUIRED",
      accessKind: access.kind,
      message:
        "Verify your email to unlock sold-based home estimates. Your account is ready — verification keeps client data secure.",
    };
  }
  return {
    status: "AUTH_REQUIRED",
    accessKind: access.kind,
    message:
      "Create a free client account or sign in to view sold-based home estimates based on recent comparable sales.",
  };
}

/** sessionStorage key for persisting the valuation draft across auth modal. */
export const HOME_VALUE_DRAFT_STORAGE_KEY = "houzzat:home-valuation-draft-v1";

export type HomeValueFormDraft = {
  address: string;
  city: string;
  community: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  verifiedAddress: string | null;
  beds: string;
  baths: string;
  sqft: string;
  basement: string;
  propertyType: string;
  step: "address" | "features" | "contact" | "result";
  savedAt: string;
};

export function serializeHomeValueDraft(
  draft: Omit<HomeValueFormDraft, "savedAt">,
): string {
  const payload: HomeValueFormDraft = {
    ...draft,
    savedAt: new Date().toISOString(),
  };
  return JSON.stringify(payload);
}

export function parseHomeValueDraft(raw: string | null): HomeValueFormDraft | null {
  if (!raw?.trim()) return null;
  try {
    const data = JSON.parse(raw) as Partial<HomeValueFormDraft>;
    if (!data.address || typeof data.address !== "string") return null;
    return {
      address: data.address,
      city: typeof data.city === "string" ? data.city : "",
      community:
        typeof data.community === "string" || data.community === null
          ? (data.community as string | null)
          : null,
      lat: typeof data.lat === "number" ? data.lat : null,
      lng: typeof data.lng === "number" ? data.lng : null,
      placeId: typeof data.placeId === "string" ? data.placeId : null,
      verifiedAddress:
        typeof data.verifiedAddress === "string" ? data.verifiedAddress : null,
      beds: typeof data.beds === "string" ? data.beds : "",
      baths: typeof data.baths === "string" ? data.baths : "",
      sqft: typeof data.sqft === "string" ? data.sqft : "",
      basement: typeof data.basement === "string" ? data.basement : "unknown",
      propertyType: typeof data.propertyType === "string" ? data.propertyType : "",
      step:
        data.step === "features" ||
        data.step === "contact" ||
        data.step === "result" ||
        data.step === "address"
          ? data.step
          : "features",
      savedAt: typeof data.savedAt === "string" ? data.savedAt : "",
    };
  } catch {
    return null;
  }
}
