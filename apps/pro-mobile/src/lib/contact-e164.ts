/**
 * Keep aligned with src/lib/sms/e164.ts resolveCommunicationsE164().
 * Native app cannot import the Next.js path alias.
 */
export function resolveCommunicationsE164(
  phone: string | null | undefined,
  phoneE164: string | null | undefined,
): string | null {
  const derived = normalizeToE164(phone);
  if (derived) return derived;
  if (typeof phone === "string" && phone.trim()) return null;
  return isE164(phoneE164) ? phoneE164 : null;
}

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

function isE164(value: string | null | undefined): value is string {
  return typeof value === "string" && E164_PATTERN.test(value);
}

function normalizeToE164(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (isE164(trimmed)) return trimmed;
  if (/[a-z]/i.test(trimmed) && !trimmed.startsWith("+")) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (/^00[1-9]\d{7,14}$/.test(digits)) {
    const candidate = `+${digits.slice(2)}`;
    return isE164(candidate) ? candidate : null;
  }
  if (/^1[2-9]\d{9}$/.test(digits)) return `+${digits}`;
  if (/^[2-9]\d{9}$/.test(digits)) return `+1${digits}`;
  if (trimmed.startsWith("+")) {
    const candidate = `+${digits}`;
    return isE164(candidate) ? candidate : null;
  }
  return null;
}

export function contactTelHref(
  phone: string | null | undefined,
  phoneE164: string | null | undefined,
): string | null {
  const e164 = resolveCommunicationsE164(phone, phoneE164);
  return e164 ? `tel:${e164}` : null;
}

export function contactSmsHref(
  phone: string | null | undefined,
  phoneE164: string | null | undefined,
): string | null {
  const e164 = resolveCommunicationsE164(phone, phoneE164);
  return e164 ? `sms:${e164}` : null;
}
