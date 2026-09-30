import type { CaptureIntentType } from "@/lib/auth/capture-intent";

export type AuthModalCopy = {
  headline: string;
  subhead: string;
};

function accountAction(mode: "sign-in" | "sign-up", displayName: string): string {
  return mode === "sign-up"
    ? `Create your free ${displayName} account`
    : `Sign in to your free ${displayName} account`;
}

/**
 * Presentation only. Does not describe storage, access rules, or the signup payload.
 */
export function authModalCopy(
  intent: CaptureIntentType,
  mode: "sign-in" | "sign-up",
  displayName: string,
): AuthModalCopy {
  const action = accountAction(mode, displayName);
  switch (intent) {
    case "VIEW_LISTING":
      return {
        headline: "Sign in to view this listing",
        subhead: `${action} to see the restricted listing details available to registered users.`,
      };
    case "SAVE_LISTING":
      return {
        headline: "Save this home",
        subhead: `${action} to save this home.`,
      };
    case "SAVE_SEARCH":
      return {
        headline: "Save this search",
        subhead: `${action} to keep this search.`,
      };
    case "PROPERTY_WATCH":
      return {
        headline: "Watch this property",
        subhead: `${action} to follow changes to this home.`,
      };
    case "AREA_WATCH":
      return {
        headline: "Watch this area",
        subhead: `${action} to follow listings in this area.`,
      };
    case "REQUEST_VIEWING":
      return {
        headline: "Request a viewing",
        subhead: `${action} to continue requesting this viewing.`,
      };
    case "CONTACT_AGENT":
      return {
        headline: "Contact an agent",
        subhead: `${action} to contact an agent.`,
      };
    case "START_CHAT":
      return {
        headline: "Start the conversation",
        subhead: `${action} to start your conversation.`,
      };
    case "ROUTE_PLANNER":
      return {
        headline: "Plan your viewing route",
        subhead: `${action} to keep this route.`,
      };
    default: {
      const _exhaustive: never = intent;
      return _exhaustive;
    }
  }
}
