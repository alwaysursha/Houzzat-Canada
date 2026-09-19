/**
 * Twilio SID shape: 2-letter prefix + 32 hex. Used for Workspace ISV fields
 * and webhook AccountSid matching. Secrets are never inferred from SIDs.
 */
const TWILIO_SID = /^[A-Z]{2}[0-9a-fA-F]{32}$/;

export type TwilioSidPrefix = "AC" | "MG" | "PN";

export function isTwilioSid(
  value: string | null | undefined,
  prefix: TwilioSidPrefix,
): value is string {
  const sid = value?.trim() ?? "";
  return sid.startsWith(prefix) && TWILIO_SID.test(sid);
}

export function normalizeTwilioSid(
  value: string | null | undefined,
  prefix: TwilioSidPrefix,
): string | null {
  const sid = value?.trim() ?? "";
  return isTwilioSid(sid, prefix) ? sid : null;
}
