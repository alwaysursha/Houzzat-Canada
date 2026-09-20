/**
 * SMS consent classes. STOP suppression is workspace+phone scoped.
 * smsAlertsEnabled is a marketing preference — never required for
 * conversational, transactional, staff, or partner SMS.
 */
export type SmsClass =
  | "conversational"
  | "transactional"
  | "marketing"
  | "staff"
  | "partner";

export type SmsSkipReason =
  | "missing_credentials"
  | "missing_workspace"
  | "missing_subaccount"
  | "missing_messaging_service"
  | "empty_body"
  | "invalid_to"
  | "invalid_from"
  | "suppressed";

export type SendSmsResult =
  | {
      status: "sent";
      sid: string;
      providerStatus: string;
      numSegments?: number | null;
    }
  | { status: "skipped"; reason: SmsSkipReason }
  | { status: "failed" };

export type SendSmsInput = {
  to: string;
  body: string;
  smsClass: SmsClass;
  workspaceId?: string | null;
  /** Override From. Must already be E.164 if set. */
  fromE164?: string | null;
  /**
   * Twilio StatusCallback. Undefined = transport default.
   * Null/empty = omit (Phase 1 tests / local stub).
   */
  statusCallbackUrl?: string | null;
};

/** Carrier STOP applies to every outbound class from that workspace number. */
export function smsClassHonorsStopSuppression(smsClass: SmsClass): boolean {
  return Boolean(smsClass);
}

/**
 * Account `smsAlertsEnabled` is marketing-only. Direct conversational /
 * transactional / staff / partner SMS must not consult it.
 */
export function smsClassRequiresSmsAlertsEnabled(
  smsClass: SmsClass,
): boolean {
  return smsClass === "marketing";
}
