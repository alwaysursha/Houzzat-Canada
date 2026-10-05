import {
  isCustomerPolicyExemptClass,
  isOptionalEmailClass,
  type CommunicationCategory,
  type CommunicationChannel,
  type CommunicationClass,
} from "@/lib/communications/classification";
import { categoryPreferenceOrDefault as categoryEnabledOrDefault } from "@/lib/communications/category-map";
import {
  legacyBuyerDigestPrimaryEligible,
  legacyBuyerDigestUserEligible,
  legacyCrmEmailEligible,
  legacyWatchEmailEligible,
} from "@/lib/communications/legacy-eligibility";
import type { SuppressionLookupStatus } from "@/lib/communications/suppression";
import { isPushTypeEnabled, type PushType } from "@/lib/notifications/catalog";

export type CommunicationPolicyInput = {
  class: CommunicationClass;
  category: CommunicationCategory;
  channel: CommunicationChannel;
  email?: string | null;
  emailAlertsEnabled?: boolean;
  /** Entity-level emailAlerts when the send is for one monitor/search. */
  entityEmailAlerts?: boolean;
  /**
   * Future category row. `undefined` = no row = existing production behavior.
   * `false` would block optional email/push in later phases.
   */
  categoryEnabled?: boolean;
  contactConsentAt?: Date | null;
  caslConsentAt?: Date | null;
  isBuyer?: boolean;
  disabledAt?: Date | null;
  /** Legacy boolean. Prefer `emailSuppressionLookup` when the caller has it. */
  emailSuppressed?: boolean;
  emailSuppressionLookup?: SuppressionLookupStatus;
  pushPrefs?: unknown;
  pushType?: PushType;
};

export type CommunicationPolicyDecision = {
  allowed: boolean;
  reason:
    | "allowed"
    | "transactional_exempt"
    | "internal_exempt"
    | "unclassified_legacy"
    | "email_suppressed"
    | "email_alerts_off"
    | "entity_alerts_off"
    | "category_off"
    | "consent_required"
    | "push_pref_off"
    | "user_ineligible"
    | "missing_email"
    | "suppression_lookup_unavailable";
  suppressionLookup: SuppressionLookupStatus | "not_applicable";
};

function resolveSuppressionLookup(
  input: CommunicationPolicyInput,
): SuppressionLookupStatus | "not_applicable" {
  if (input.emailSuppressionLookup) return input.emailSuppressionLookup;
  if (input.emailSuppressed === true) return "suppressed";
  if (input.emailSuppressed === false) return "not_suppressed";
  return "not_applicable";
}

/**
 * Canonical “may this communication be sent?” resolver.
 * Missing category preference must not change current production gates.
 * Lookup failure is never collapsed into “not suppressed”.
 */
export function evaluateCommunicationPolicy(
  input: CommunicationPolicyInput,
): CommunicationPolicyDecision {
  if (input.channel === "push") {
    if (input.pushType && !isPushTypeEnabled(input.pushPrefs, input.pushType)) {
      return {
        allowed: false,
        reason: "push_pref_off",
        suppressionLookup: "not_applicable",
      };
    }
    return {
      allowed: true,
      reason: "allowed",
      suppressionLookup: "not_applicable",
    };
  }

  if (input.class === "transactional") {
    return {
      allowed: true,
      reason: "transactional_exempt",
      suppressionLookup: "not_applicable",
    };
  }

  if (input.class === "internal") {
    return {
      allowed: true,
      reason: "internal_exempt",
      suppressionLookup: "not_applicable",
    };
  }

  const suppressionLookup = resolveSuppressionLookup(input);

  if (suppressionLookup === "suppressed") {
    return {
      allowed: false,
      reason: "email_suppressed",
      suppressionLookup,
    };
  }

  if (
    input.class !== "unclassified" &&
    input.emailAlertsEnabled === false
  ) {
    return {
      allowed: false,
      reason: "email_alerts_off",
      suppressionLookup,
    };
  }

  if (input.categoryEnabled === false) {
    return {
      allowed: false,
      reason: "category_off",
      suppressionLookup,
    };
  }

  if (input.class === "unclassified") {
    if (suppressionLookup === "unavailable") {
      return {
        allowed: true,
        reason: "suppression_lookup_unavailable",
        suppressionLookup,
      };
    }
    return {
      allowed: true,
      reason: "unclassified_legacy",
      suppressionLookup,
    };
  }

  if (suppressionLookup === "unavailable") {
    return {
      allowed: true,
      reason: "suppression_lookup_unavailable",
      suppressionLookup,
    };
  }

  if (input.class === "alert") {
    if (input.category === "buyer_digest") {
      if (
        !legacyBuyerDigestUserEligible({
          isBuyer: input.isBuyer ?? true,
          emailAlertsEnabled: input.emailAlertsEnabled ?? true,
          disabledAt: input.disabledAt ?? null,
          email: input.email ?? "",
        })
      ) {
        return {
          allowed: false,
          reason: "user_ineligible",
          suppressionLookup,
        };
      }
      if (
        !legacyBuyerDigestPrimaryEligible({
          primaryEmailAlerts: input.entityEmailAlerts ?? null,
        })
      ) {
        return {
          allowed: false,
          reason: "entity_alerts_off",
          suppressionLookup,
        };
      }
      return { allowed: true, reason: "allowed", suppressionLookup };
    }

    if (
      input.category === "seller_report" ||
      input.category === "saved_search"
    ) {
      return { allowed: true, reason: "allowed", suppressionLookup };
    }

    if (
      !legacyWatchEmailEligible({
        email: input.email,
        emailAlertsEnabled: input.emailAlertsEnabled ?? true,
        monitorEmailAlerts: input.entityEmailAlerts ?? true,
      })
    ) {
      if (!input.email) {
        return { allowed: false, reason: "missing_email", suppressionLookup };
      }
      if (input.emailAlertsEnabled === false) {
        return {
          allowed: false,
          reason: "email_alerts_off",
          suppressionLookup,
        };
      }
      return {
        allowed: false,
        reason: "entity_alerts_off",
        suppressionLookup,
      };
    }
    return { allowed: true, reason: "allowed", suppressionLookup };
  }

  if (input.class === "agent") {
    if (
      !legacyCrmEmailEligible({
        contactConsentAt: input.contactConsentAt ?? null,
        caslConsentAt: input.caslConsentAt ?? null,
        emailAlertsEnabled: input.emailAlertsEnabled,
      })
    ) {
      if (input.emailAlertsEnabled === false) {
        return {
          allowed: false,
          reason: "email_alerts_off",
          suppressionLookup,
        };
      }
      return {
        allowed: false,
        reason: "consent_required",
        suppressionLookup,
      };
    }
    return { allowed: true, reason: "allowed", suppressionLookup };
  }

  if (input.emailAlertsEnabled === false) {
    return { allowed: false, reason: "email_alerts_off", suppressionLookup };
  }

  return { allowed: true, reason: "allowed", suppressionLookup };
}

export function categoryPreferenceOrDefault(
  enabled: boolean | undefined,
): boolean {
  return categoryEnabledOrDefault(enabled);
}

export function optionalEmailMayBeSuppressed(
  communicationClass: CommunicationClass,
): boolean {
  return isOptionalEmailClass(communicationClass);
}

export function customerPolicyExempt(communicationClass: CommunicationClass) {
  return isCustomerPolicyExemptClass(communicationClass);
}
