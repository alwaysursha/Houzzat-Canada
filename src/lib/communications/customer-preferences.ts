import {
  CUSTOMER_OPTIONAL_EMAIL_CATEGORIES,
  type CommunicationCategory,
  type CustomerOptionalEmailCategory,
} from "@/lib/communications/classification";
import { categoryPreferenceOrDefault } from "@/lib/communications/category-map";
import { evaluateCommunicationPolicy } from "@/lib/communications/policy";
import type { CommunicationPreferenceStore } from "@/lib/communications/preference-store";
import {
  findCustomerEmailSuppression,
  findMailboxEmailSuppression,
  lookupEmailSuppression,
  type EmailSuppressionStore,
  type SuppressionLookupStatus,
} from "@/lib/communications/suppression";

export type CategoryBlockedReason =
  | "email_suppressed"
  | "email_alerts_off"
  | "category_off"
  | "customer_unsubscribed"
  | null;

export type EffectiveCategoryPreference = {
  category: CustomerOptionalEmailCategory;
  channel: "email";
  enabled: boolean;
  explicit: boolean;
  effective: boolean;
  blockedReason: CategoryBlockedReason;
};

export type GlobalOptionalEmailMismatch =
  | "global_on_with_customer_unsubscribe"
  | "global_off_without_customer_unsubscribe"
  | null;

export type CustomerCommunicationPreferences = {
  userId: string;
  workspaceId: string | null;
  globalEmailEnabled: boolean;
  customerUnsubscribed: boolean;
  optionalEmailEffective: boolean;
  optionalEmailMismatch: boolean;
  optionalEmailMismatchReason: GlobalOptionalEmailMismatch;
  mailboxSuppressed: boolean;
  suppressionLookup: SuppressionLookupStatus | "not_applicable";
  categories: EffectiveCategoryPreference[];
  /**
   * SAVED_SEARCH has no independent production email sender today.
   * Buyer digest uses BUYER_DIGEST + primary SavedSearch.emailAlerts.
   */
  savedSearchEmailSender: "none";
  /** MARKETING has a template kind but no production marketing sender. */
  marketingEmailSender: "none";
};

const POLICY_CLASS: Record<
  CustomerOptionalEmailCategory,
  "alert" | "agent" | "marketing"
> = {
  property_watch: "alert",
  area_watch: "alert",
  saved_search: "alert",
  buyer_digest: "alert",
  seller_report: "alert",
  agent_communication: "agent",
  marketing: "marketing",
};

export async function getCustomerCommunicationPreferences(input: {
  userId: string;
  workspaceId: string | null;
  email: string | null;
  emailAlertsEnabled: boolean;
  preferenceStore: CommunicationPreferenceStore;
  suppressionStore?: EmailSuppressionStore;
}): Promise<CustomerCommunicationPreferences> {
  const rows = await input.preferenceStore.findByUser(input.userId);
  const emailRows = rows.filter((row) => row.channel === "email");

  let suppressionLookup: SuppressionLookupStatus | "not_applicable" =
    "not_applicable";
  let mailboxSuppressed = false;
  let customerUnsubscribed = false;

  if (input.workspaceId && input.email && input.suppressionStore) {
    const mailbox = await findMailboxEmailSuppression(input.suppressionStore, {
      workspaceId: input.workspaceId,
      email: input.email,
    });
    const customer = await findCustomerEmailSuppression(input.suppressionStore, {
      workspaceId: input.workspaceId,
      userId: input.userId,
    });
    mailboxSuppressed = mailbox != null;
    customerUnsubscribed = customer?.reason === "GLOBAL_UNSUBSCRIBE";
    if (mailboxSuppressed || customerUnsubscribed) {
      suppressionLookup = "suppressed";
    } else {
      const lookup = await lookupEmailSuppression(input.suppressionStore, {
        workspaceId: input.workspaceId,
        email: input.email,
        userId: input.userId,
      });
      suppressionLookup = lookup.status;
    }
  }

  let optionalEmailMismatch: GlobalOptionalEmailMismatch = null;
  if (input.emailAlertsEnabled && customerUnsubscribed) {
    optionalEmailMismatch = "global_on_with_customer_unsubscribe";
  } else if (!input.emailAlertsEnabled && !customerUnsubscribed) {
    optionalEmailMismatch = "global_off_without_customer_unsubscribe";
  }

  const optionalEmailEffective =
    input.emailAlertsEnabled && !customerUnsubscribed;

  const categories = CUSTOMER_OPTIONAL_EMAIL_CATEGORIES.map((category) =>
    effectiveCategoryState({
      category,
      email: input.email,
      emailAlertsEnabled: input.emailAlertsEnabled,
      suppressionLookup:
        suppressionLookup === "not_applicable"
          ? undefined
          : suppressionLookup,
      explicitRow: emailRows.find((row) => row.category === category) ?? null,
    }),
  );

  return {
    userId: input.userId,
    workspaceId: input.workspaceId,
    globalEmailEnabled: input.emailAlertsEnabled,
    customerUnsubscribed,
    optionalEmailEffective,
    optionalEmailMismatch: optionalEmailMismatch != null,
    optionalEmailMismatchReason: optionalEmailMismatch,
    mailboxSuppressed,
    suppressionLookup,
    categories,
    savedSearchEmailSender: "none",
    marketingEmailSender: "none",
  };
}

export function effectiveCategoryState(input: {
  category: CustomerOptionalEmailCategory;
  email: string | null;
  emailAlertsEnabled: boolean;
  suppressionLookup?: SuppressionLookupStatus;
  explicitRow: { enabled: boolean } | null;
}): EffectiveCategoryPreference {
  const explicit = input.explicitRow != null;
  const enabled = categoryPreferenceOrDefault(input.explicitRow?.enabled);
  const decision = evaluateCommunicationPolicy({
    class: POLICY_CLASS[input.category],
    category: input.category,
    channel: "email",
    email: input.email ?? "placeholder@example.com",
    emailAlertsEnabled: input.emailAlertsEnabled,
    entityEmailAlerts: true,
    categoryEnabled: enabled,
    contactConsentAt: new Date(),
    caslConsentAt: new Date(),
    isBuyer: true,
    disabledAt: null,
    emailSuppressionLookup: input.suppressionLookup,
  });

  let blockedReason: CategoryBlockedReason = null;
  if (!decision.allowed) {
    switch (decision.reason) {
      case "email_suppressed":
        blockedReason = "email_suppressed";
        break;
      case "email_alerts_off":
        blockedReason = "email_alerts_off";
        break;
      case "category_off":
        blockedReason = "category_off";
        break;
      default:
        blockedReason = input.emailAlertsEnabled ? "category_off" : "email_alerts_off";
        break;
    }
  }

  return {
    category: input.category,
    channel: "email",
    enabled,
    explicit,
    effective: decision.allowed,
    blockedReason,
  };
}

export async function customerCategoryEmailEnabled(input: {
  store: CommunicationPreferenceStore;
  userId: string;
  category: CommunicationCategory;
}): Promise<boolean> {
  const row = await input.store.findOne({
    userId: input.userId,
    category: input.category,
    channel: "email",
  });
  return categoryPreferenceOrDefault(row?.enabled);
}
