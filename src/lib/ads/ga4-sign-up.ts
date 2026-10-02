type GtagFn = (...args: unknown[]) => void;

function installedGtag(): GtagFn | undefined {
  if (typeof window === "undefined") return undefined;
  const gtag = (window as Window & { gtag?: unknown }).gtag;
  return typeof gtag === "function" ? (gtag as GtagFn) : undefined;
}

/**
 * Signup conversions after a new account exists. Fires GA4 sign_up and the
 * Google Ads native conversion. Missing or broken gtag must not affect signup.
 */
export function reportGa4SignUp(gtag: GtagFn | undefined = installedGtag()): void {
  try {
    gtag?.("event", "sign_up", { method: "email" });
    gtag?.("event", "conversion_event_signup", {});
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
