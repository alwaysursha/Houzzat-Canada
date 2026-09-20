/**
 * Minimum Conversation Message payload for Lead-recipient automated SMS.
 * Agent-notification automations must not persist Conversation Messages.
 */
import { smsAutomationKeyFromPayload } from "@/lib/platform/sms-automations/catalog";

export type SmsAutomationMessagePayload = {
  automationKey: string;
};

export function isSmsAutomationTextPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const keys = Object.keys(payload as object);
  return keys.length === 1 && keys[0] === "automationKey"
    ? Boolean(smsAutomationKeyFromPayload(payload))
    : false;
}

export function smsAutomationMessagePayload(
  automationKey: string,
): SmsAutomationMessagePayload | null {
  const key = automationKey.trim();
  return key ? { automationKey: key } : null;
}

export function presentSmsAutomationMessagePayload(
  payload: unknown,
): SmsAutomationMessagePayload | null {
  const key = smsAutomationKeyFromPayload(payload);
  return key ? { automationKey: key } : null;
}
