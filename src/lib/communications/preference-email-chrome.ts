import {
  classifyEmailKind,
  isOptionalEmailClass,
} from "@/lib/communications/classification";
import type { CustomerCommunicationPreferences } from "@/lib/communications/customer-preferences";
import {
  buildOneClickUnsubscribeUrl,
  buildPreferenceCenterUrl,
  buildUnsubscribeIntentUrl,
  issuePreferenceAccessToken,
  listUnsubscribeHeaders,
  resolvePreferencePublicOrigin,
} from "@/lib/communications/preference-token-service";
import type { CommunicationPreferenceTokenStore } from "@/lib/communications/preference-token-types";

export function optionalEmailEligibleForPreferenceChrome(kind: string): boolean {
  const classified = classifyEmailKind(kind);
  return isOptionalEmailClass(classified.class);
}

export type CustomerPreferenceEmailChrome = {
  manageUrl: string;
  unsubscribeIntentUrl: string;
  oneClickUrl: string;
  headers: Record<string, string>;
  manageTokenId: string;
  oneClickTokenId: string;
};

export async function buildCustomerPreferenceEmailChrome(input: {
  userId: string;
  workspaceId: string;
  email: string;
  origin?: string;
  store?: CommunicationPreferenceTokenStore;
}): Promise<CustomerPreferenceEmailChrome | null> {
  if (!input.workspaceId.trim() || !input.email.trim()) return null;
  const origin =
    input.origin ?? (await resolvePreferencePublicOrigin(input.workspaceId));
  const manage = await issuePreferenceAccessToken({
    userId: input.userId,
    workspaceId: input.workspaceId,
    email: input.email,
    purpose: "manage",
    source: "email_send",
    store: input.store,
  });
  const oneClick = await issuePreferenceAccessToken({
    userId: input.userId,
    workspaceId: input.workspaceId,
    email: input.email,
    purpose: "one_click",
    source: "email_send",
    store: input.store,
  });
  const manageUrl = buildPreferenceCenterUrl(origin, manage.rawToken);
  const oneClickUrl = buildOneClickUnsubscribeUrl(origin, oneClick.rawToken);
  return {
    manageUrl,
    unsubscribeIntentUrl: buildUnsubscribeIntentUrl(origin, manage.rawToken),
    oneClickUrl,
    headers: listUnsubscribeHeaders(oneClickUrl),
    manageTokenId: manage.tokenId,
    oneClickTokenId: oneClick.tokenId,
  };
}

export type PublicPreferenceCenterPayload = {
  globalEmailEnabled: boolean;
  customerUnsubscribed: boolean;
  optionalEmailEffective: boolean;
  optionalEmailMismatch: boolean;
  optionalEmailMismatchReason:
    | "global_on_with_customer_unsubscribe"
    | "global_off_without_customer_unsubscribe"
    | null;
  mailboxSuppressed: boolean;
  categories: CustomerCommunicationPreferences["categories"];
  savedSearchEmailSender: CustomerCommunicationPreferences["savedSearchEmailSender"];
  marketingEmailSender: CustomerCommunicationPreferences["marketingEmailSender"];
};

export function toPublicPreferenceCenterPayload(
  prefs: CustomerCommunicationPreferences,
): PublicPreferenceCenterPayload {
  return {
    globalEmailEnabled: prefs.globalEmailEnabled,
    customerUnsubscribed: prefs.customerUnsubscribed,
    optionalEmailEffective: prefs.optionalEmailEffective,
    optionalEmailMismatch: prefs.optionalEmailMismatch,
    optionalEmailMismatchReason: prefs.optionalEmailMismatchReason,
    mailboxSuppressed: prefs.mailboxSuppressed,
    categories: prefs.categories,
    savedSearchEmailSender: prefs.savedSearchEmailSender,
    marketingEmailSender: prefs.marketingEmailSender,
  };
}

export function preferenceFooterFields(chrome: {
  manageUrl: string;
  unsubscribeIntentUrl: string;
} | null | undefined) {
  if (!chrome) return {};
  return {
    preferencesManageUrl: chrome.manageUrl,
    unsubscribeIntentUrl: chrome.unsubscribeIntentUrl,
  };
}
