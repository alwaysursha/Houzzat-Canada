import type { CaptureIntentType } from "@/lib/auth/capture-intent";

export type AuthModalCopy = {
  headline: string;
  subhead: string;
  /** Primary signup CTA — contextual continuation. */
  cta: string;
};

/**
 * Presentation only. Does not describe storage, access rules, or the signup payload.
 */
export function authModalCopy(
  intent: CaptureIntentType,
  mode: "sign-in" | "sign-up",
  displayName: string,
): AuthModalCopy {
  const team = displayName.trim() || "your team";
  switch (intent) {
    case "VIEW_LISTING":
      return {
        headline: mode === "sign-up" ? "Continue to this home" : "Sign in to continue",
        subhead:
          mode === "sign-up"
            ? `Create your free ${team} account to view this listing.`
            : `Sign in to view this listing.`,
        cta: "Continue to Property",
      };
    case "SAVE_LISTING":
      return {
        headline: "Save this home",
        subhead:
          mode === "sign-up"
            ? `Create your free ${team} account to save this home.`
            : "Sign in to save this home.",
        cta: "Save This Home",
      };
    case "SAVE_SEARCH":
      return {
        headline: "Save this search",
        subhead:
          mode === "sign-up"
            ? `Create your free ${team} account to keep this search.`
            : "Sign in to keep this search.",
        cta: "Save My Search",
      };
    case "PROPERTY_WATCH":
      return {
        headline: "Watch this property",
        subhead:
          mode === "sign-up"
            ? `Create your free ${team} account to follow this home.`
            : "Sign in to follow this home.",
        cta: "Start Property Watch",
      };
    case "AREA_WATCH":
      return {
        headline: "Watch this area",
        subhead:
          mode === "sign-up"
            ? `Create your free ${team} account to follow this area.`
            : "Sign in to follow this area.",
        cta: "Start Area Watch",
      };
    case "REQUEST_VIEWING":
      return {
        headline: "Request a viewing",
        subhead:
          mode === "sign-up"
            ? `Create your free ${team} account to continue.`
            : "Sign in to continue your viewing request.",
        cta: "Continue to Viewing",
      };
    case "CONTACT_AGENT":
      return {
        headline: "Contact an agent",
        subhead:
          mode === "sign-up"
            ? `Create your free ${team} account to contact an agent.`
            : "Sign in to contact an agent.",
        cta: "Contact Agent",
      };
    case "START_CHAT":
      return {
        headline: "Start the conversation",
        subhead:
          mode === "sign-up"
            ? `Create your free ${team} account to chat.`
            : "Sign in to start your conversation.",
        cta: "Start Chat",
      };
    case "ROUTE_PLANNER":
      return {
        headline: "Plan your viewing route",
        subhead:
          mode === "sign-up"
            ? `Create your free ${team} account to keep this route.`
            : "Sign in to keep this route.",
        cta: "Continue Route Planner",
      };
    case "DRIVE_TIME":
      return {
        headline: "Check drive times",
        subhead:
          mode === "sign-up"
            ? `Create your free ${team} account to save Home, Work, and School.`
            : "Sign in to see drive times.",
        cta: "Continue Drive Times",
      };
    default: {
      const _exhaustive: never = intent;
      return _exhaustive;
    }
  }
}
