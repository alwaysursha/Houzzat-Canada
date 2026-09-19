/**
 * Twilio-supported SMS keyword matching for STOP/START/HELP.
 *
 * Audit: this repo has no Twilio Advanced Opt-Out config and V1 numbers are
 * Canadian long codes (US Standard Opt-Out auto-replies do not apply).
 * Keyword acknowledgements are therefore returned as TwiML unless
 * TWILIO_MANAGES_KEYWORD_REPLIES is set.
 *
 * HouzzatPRO does not treat YES as START. Customers commonly reply "Yes"
 * to agent questions; that body is a normal conversational SMS.
 */

export type InboundSmsKeyword = "STOP" | "START" | "HELP";

const STOP_KEYWORDS = new Set([
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
]);
const START_KEYWORDS = new Set(["START", "UNSTOP"]);
const HELP_KEYWORDS = new Set(["HELP", "INFO"]);

export const SMS_STOP_ACK =
  "You are unsubscribed from SMS from this number. Reply START to resubscribe. This does not change marketing property alerts.";
export const SMS_START_ACK =
  "You can receive SMS from this number again. Marketing property alerts stay off unless you enable them in your account.";
export const SMS_HELP_ACK =
  "HouzzatPRO SMS: Reply STOP to unsubscribe. Message and data rates may apply.";

export function twilioManagesKeywordReplies(): boolean {
  const raw = process.env.TWILIO_MANAGES_KEYWORD_REPLIES?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export function classifyInboundSmsKeyword(
  raw: string | null | undefined,
): InboundSmsKeyword | null {
  if (raw == null) return null;
  const normalized = raw
    .replace(/\r\n/g, "\n")
    .trim()
    .replace(/^["'“”«»]+|["'“”«»]+$/g, "")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
  if (!normalized) return null;
  if (STOP_KEYWORDS.has(normalized)) return "STOP";
  if (START_KEYWORDS.has(normalized)) return "START";
  if (HELP_KEYWORDS.has(normalized)) return "HELP";
  return null;
}

export function keywordAcknowledgement(
  keyword: InboundSmsKeyword,
): string {
  switch (keyword) {
    case "STOP":
      return SMS_STOP_ACK;
    case "START":
      return SMS_START_ACK;
    case "HELP":
      return SMS_HELP_ACK;
  }
}

export function emptyTwiml(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
}

export function messageTwiml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(body)}</Message></Response>`;
}

export function keywordTwiml(
  keyword: InboundSmsKeyword,
  managedByTwilio: boolean,
): string {
  if (managedByTwilio) return emptyTwiml();
  return messageTwiml(keywordAcknowledgement(keyword));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
