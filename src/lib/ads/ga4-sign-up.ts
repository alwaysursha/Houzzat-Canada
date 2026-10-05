type GtagFn = (...args: unknown[]) => void;

/** Global helper the Google tag snippet installs so Ads can see the event names in HTML. */
export const HOUZZAT_SIGN_UP_GTAG = "__houzzatReportSignUp";

/**
 * Inline event snippet for the Google tag. Declared on every page so Ads can
 * detect it; invoked only after a created account.
 */
export function googleAdsSignUpEventSnippet(): string {
  return `window.${HOUZZAT_SIGN_UP_GTAG}=function(){gtag('event','sign_up',{method:'email'});gtag('event','conversion_event_signup',{});gtag('event','conversion_event_signup_1',{});};`;
}

function installedGtag(): GtagFn | undefined {
  if (typeof window === "undefined") return undefined;
  const gtag = (window as Window & { gtag?: unknown }).gtag;
  return typeof gtag === "function" ? (gtag as GtagFn) : undefined;
}

function fireSignUpEvents(gtag: GtagFn | undefined): void {
  gtag?.("event", "sign_up", { method: "email" });
  // Legacy custom event name (kept for existing GA4/Ads mappings).
  gtag?.("event", "conversion_event_signup", {});
  // Google Ads conversion created as SIGNUP (1) — event snippet name.
  gtag?.("event", "conversion_event_signup_1", {});
}

/**
 * Signup conversions after a new account exists. Fires GA4 sign_up and the
 * Google Ads native conversion. Missing or broken gtag must not affect signup.
 */
export function reportGa4SignUp(gtag?: GtagFn): void {
  try {
    if (gtag) {
      fireSignUpEvents(gtag);
      return;
    }
    if (typeof window !== "undefined") {
      const helper = (window as Window & { [HOUZZAT_SIGN_UP_GTAG]?: unknown })[
        HOUZZAT_SIGN_UP_GTAG
      ];
      if (typeof helper === "function") {
        helper();
        return;
      }
    }
    fireSignUpEvents(installedGtag());
  } catch {
    return;
  }
}

export type Ga4LeadRequestKind = "showing" | "virtual_viewing" | "inquiry";

/** Event name for a lead request that /api/leads has already accepted. */
export function ga4LeadRequestEvent(
  kind: Ga4LeadRequestKind,
): "request_viewing" | "contact_agent" {
  switch (kind) {
    case "showing":
    case "virtual_viewing":
      return "request_viewing";
    case "inquiry":
      return "contact_agent";
    default: {
      const unexpected: never = kind;
      return unexpected;
    }
  }
}

/**
 * Fires only when the caller already knows /api/leads succeeded.
 * No parameters. Missing or broken gtag must not affect the lead request.
 */
export function reportGa4LeadRequest(
  kind: Ga4LeadRequestKind,
  gtag: GtagFn | undefined = installedGtag(),
): void {
  try {
    gtag?.("event", ga4LeadRequestEvent(kind));
  } catch {
    return;
  }
}
