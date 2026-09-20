/**
 * SMS segment accounting. Twilio bills concatenated parts, not messages.
 * GSM-7 uses 160 / 153; UCS-2 uses 70 / 67. Extension-table GSM chars
 * count as two septets. Provider NumSegments replaces the estimate.
 */

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

const GSM_BASIC_SET = new Set(GSM_BASIC.split(""));
const GSM_EXT_SET = new Set(["^", "{", "}", "\\", "[", "~", "]", "|", "€"]);

export function gsm7SeptetLength(body: string): number | null {
  let length = 0;
  for (const char of body) {
    if (GSM_EXT_SET.has(char)) {
      length += 2;
      continue;
    }
    if (!GSM_BASIC_SET.has(char)) return null;
    length += 1;
  }
  return length;
}

export function estimateSmsSegmentCount(body: string): number {
  const text = body ?? "";
  if (!text) return 0;
  const gsm = gsm7SeptetLength(text);
  if (gsm != null) {
    if (gsm <= 160) return 1;
    return Math.ceil(gsm / 153);
  }
  const ucs = text.length;
  if (ucs <= 70) return 1;
  return Math.ceil(ucs / 67);
}

export function parseTwilioNumSegments(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}
