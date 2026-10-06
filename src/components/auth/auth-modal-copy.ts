import type { CaptureIntentType } from "@/lib/auth/capture-intent";

export type AuthModalCopy = {
  headline: string;
  subhead: string;
  /** Optional freshness / inventory line under the subhead. */
  freshness?: string | null;
  /** Primary signup CTA — contextual continuation. */
  cta: string;
};

/** User-friendly calendar date for access copy (site-local day). */
export function formatAccessInventoryDate(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Truthful inventory line. Prefer non-dated wording unless callers have
 * verified MLS freshness metadata (this helper does not claim a sync time).
 */
export function accessInventoryLine(_now: Date = new Date()): string {
  return "See current prices, photos and listing details.";
}

/**
 * Presentation only. Does not describe storage, access rules, or the signup payload.
 */
export function authModalCopy(
  intent: CaptureIntentType,
  mode: "sign-in" | "sign-up",
  displayName: string,
  now: Date = new Date(),
): AuthModalCopy {
  const team = displayName.trim() || "your team";
  switch (intent) {
    case "VIEW_LISTING":
      return {
        headline: mode === "sign-up" ? "Free Access" : "Sign in to continue",
        subhead:
          mode === "sign-up"
            ? "Access full property details and exclusive listings."
            : "Sign in to view this listing.",
        freshness: mode === "sign-up" ? accessInventoryLine(now) : null,
        cta: "Continue to Property",
      };
    case "SAVE_LISTING":
      return {
        headline: "Save this home",
        subhead:
          mode === "sign-up"
            ? "Save this home so you can come back to it anytime."
            : "Sign in to save this home.",
        cta: "Save This Home",
      };
    case "SAVE_SEARCH":
      return {
        headline: "Save this search",
        subhead:
          mode === "sign-up"
            ? "Keep this search and get updates that match."
            : "Sign in to keep this search.",
        cta: "Save My Search",
      };
    case "PROPERTY_WATCH":
      return {
        headline: "Watch this property",
        subhead:
          mode === "sign-up"
            ? "Follow this home for price and status updates."
            : "Sign in to follow this home.",
        cta: "Start Property Watch",
      };
    case "AREA_WATCH":
      return {
        headline: "Watch this area",
        subhead:
          mode === "sign-up"
            ? "Follow this area for new listings that match."
            : "Sign in to follow this area.",
        cta: "Start Area Watch",
      };
    case "REQUEST_VIEWING":
      return {
        headline: "Request a viewing",
        subhead:
          mode === "sign-up"
            ? "Continue to request a viewing of this home."
            : "Sign in to continue your viewing request.",
        cta: "Continue to Viewing",
      };
    case "CONTACT_AGENT":
      return {
        headline: "Contact an agent",
        subhead:
          mode === "sign-up"
            ? `Continue to reach ${team} about this home.`
            : "Sign in to contact an agent.",
        cta: "Contact Agent",
      };
    case "START_CHAT":
      return {
        headline: "Start the conversation",
        subhead:
          mode === "sign-up"
            ? "Continue so you can chat about this home."
            : "Sign in to start your conversation.",
        cta: "Start Chat",
      };
    case "ROUTE_PLANNER":
      return {
        headline: "Plan your viewing route",
        subhead:
          mode === "sign-up"
            ? "Continue to keep this route for your viewings."
            : "Sign in to keep this route.",
        cta: "Continue Route Planner",
      };
    case "DRIVE_TIME":
      return {
        headline: "Check drive times",
        subhead:
          mode === "sign-up"
            ? "Continue to save Home, Work, and School."
            : "Sign in to see drive times.",
        cta: "Continue Drive Times",
      };
    default: {
      const _exhaustive: never = intent;
      return _exhaustive;
    }
  }
}
