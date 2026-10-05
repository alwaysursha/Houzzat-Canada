/**
 * Pure Preference Center presentation rules (Phase 2B-2).
 * CUSTOMER unsubscribe and MAILBOX suppression are independent.
 */

export type PreferenceCenterUiState = {
  /** MAILBOX delivery is blocked (HARD_BOUNCE/COMPLAINT etc.). */
  showMailboxWarning: boolean;
  /**
   * Customer optional-email preference is paused
   * (global email OFF and/or CUSTOMER unsubscribe).
   */
  showGlobalPause: boolean;
  /** Resume CTA for canonical global ON. */
  showResume: boolean;
  /** Extra Resume copy when mailbox still blocks delivery. */
  resumeHasDeliveryCaveat: boolean;
  /** Show unsubscribe CTA (customer currently receiving optional email). */
  showUnsubscribeCta: boolean;
  /**
   * Mount authenticated push controls. Never true in token mode —
   * token pages must not mix session push identity.
   */
  showAuthenticatedPush: boolean;
};

/**
 * Global pause is driven by customer/global preference state, never by mailbox.
 * Mailbox suppression alone does not imply the customer unsubscribed.
 */
export function isCustomerOptionalEmailPaused(input: {
  customerUnsubscribed: boolean;
  globalEmailEnabled: boolean;
}): boolean {
  return input.customerUnsubscribed || !input.globalEmailEnabled;
}

export function derivePreferenceCenterUiState(input: {
  customerUnsubscribed: boolean;
  globalEmailEnabled: boolean;
  mailboxSuppressed: boolean;
  hasManageToken: boolean;
  sessionAuthenticated: boolean;
}): PreferenceCenterUiState {
  const showGlobalPause = isCustomerOptionalEmailPaused({
    customerUnsubscribed: input.customerUnsubscribed,
    globalEmailEnabled: input.globalEmailEnabled,
  });
  const showMailboxWarning = input.mailboxSuppressed;
  return {
    showMailboxWarning,
    showGlobalPause,
    showResume: showGlobalPause,
    resumeHasDeliveryCaveat: showGlobalPause && showMailboxWarning,
    showUnsubscribeCta: !showGlobalPause,
    showAuthenticatedPush:
      !input.hasManageToken && input.sessionAuthenticated,
  };
}
