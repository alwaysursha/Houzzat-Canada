/**
 * Canonical customer communication classification.
 * Phase 1: types + kind mapping only. Existing senders keep their own gates.
 *
 * Classification correctness is separate from legacy send compatibility:
 * unknown kinds are `unclassified`, never silently labeled transactional.
 */

export const COMMUNICATION_CLASSES = [
  "transactional",
  "service",
  "alert",
  "agent",
  "marketing",
  "internal",
  "unclassified",
] as const;

export type CommunicationClass = (typeof COMMUNICATION_CLASSES)[number];

export const COMMUNICATION_CATEGORIES = [
  "property_watch",
  "area_watch",
  "saved_search",
  "buyer_digest",
  "seller_report",
  "agent_communication",
  "marketing",
  "account_security",
  "contact_update",
  "viewing",
  "internal",
  "unclassified",
] as const;

export type CommunicationCategory = (typeof COMMUNICATION_CATEGORIES)[number];

export const COMMUNICATION_CHANNELS = ["email", "push"] as const;

export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];

export type ClassifiedCommunication = {
  class: CommunicationClass;
  category: CommunicationCategory;
};

const KNOWN_KINDS: Record<string, ClassifiedCommunication> = {
  verify_email: { class: "transactional", category: "account_security" },
  verify_email_nudge: { class: "transactional", category: "account_security" },
  password_reset: { class: "transactional", category: "account_security" },
  welcome: { class: "transactional", category: "account_security" },
  contact_update_request: { class: "service", category: "contact_update" },
  price_reduction: { class: "alert", category: "property_watch" },
  property_update: { class: "alert", category: "property_watch" },
  sold_alert: { class: "alert", category: "area_watch" },
  just_listed: { class: "alert", category: "area_watch" },
  saved_search_digest: { class: "alert", category: "buyer_digest" },
  neighborhood_weekly: { class: "alert", category: "seller_report" },
  shortlist: { class: "agent", category: "agent_communication" },
  agent_message: { class: "agent", category: "agent_communication" },
  cma_share: { class: "agent", category: "agent_communication" },
  newsletter: { class: "marketing", category: "marketing" },
  lead_info_updated: { class: "internal", category: "internal" },
  staff_contact_updated: { class: "internal", category: "internal" },
  team_invite: { class: "internal", category: "internal" },
};

/**
 * Template `kind` → class/category.
 * Unknown customer kinds are unclassified — never defaulted to transactional.
 * Staff/internal kinds are explicit so they can bypass customer policy.
 */
export function classifyEmailKind(kind: string): ClassifiedCommunication {
  return (
    KNOWN_KINDS[kind] ?? {
      class: "unclassified",
      category: "unclassified",
    }
  );
}

export function isOptionalEmailClass(
  communicationClass: CommunicationClass,
): boolean {
  return (
    communicationClass === "service" ||
    communicationClass === "alert" ||
    communicationClass === "agent" ||
    communicationClass === "marketing"
  );
}

export function isCustomerPolicyExemptClass(
  communicationClass: CommunicationClass,
): boolean {
  return (
    communicationClass === "transactional" ||
    communicationClass === "internal"
  );
}
