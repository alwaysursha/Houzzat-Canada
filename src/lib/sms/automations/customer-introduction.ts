/**
 * Customer Introduction (catalog key lead.welcome_new_signup).
 * Exactly once per Lead when the Customer first has a valid E.164.
 * Missing phone must not create a terminal dispatch row.
 */
import { resolveCommunicationsE164 } from "@/lib/sms/e164";
import { SMS_AUTOMATION_KEYS, signupCycleKey } from "./constants";

export const CUSTOMER_INTRODUCTION_MISSING_PHONE = "NO_CUSTOMER_E164";

export function isCustomerIntroductionAutomationKey(key: string): boolean {
  return key === SMS_AUTOMATION_KEYS.leadWelcome;
}

export function customerIntroductionCycleKey(): string {
  return signupCycleKey();
}

export function becameFirstValidCustomerE164(input: {
  previousPhone?: string | null;
  previousPhoneE164?: string | null;
  nextPhone?: string | null;
  nextPhoneE164?: string | null;
}): boolean {
  const previous = resolveCommunicationsE164(
    input.previousPhone,
    input.previousPhoneE164,
  );
  const next = resolveCommunicationsE164(input.nextPhone, input.nextPhoneE164);
  return previous == null && next != null;
}

export function isRetryableCustomerIntroductionSkip(row: {
  automationKey: string;
  status: string;
  errorCode: string | null;
}): boolean {
  return (
    isCustomerIntroductionAutomationKey(row.automationKey) &&
    row.status === "SKIPPED" &&
    row.errorCode === CUSTOMER_INTRODUCTION_MISSING_PHONE
  );
}
