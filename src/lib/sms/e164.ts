/**
 * Conservative E.164 normalization for HouzzatPRO SMS.
 * Does not invent a country for ambiguous/international local formats.
 * NANP 10-digit numbers default to +1 (Canada/US operating region).
 *
 * Display format for Canada/US is owned by {@link formatPhoneDisplay}:
 * (647) 221 - 4949
 */

import { formatPhoneDisplay } from "@/lib/phone/format";

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export type E164 = string & { readonly __brand: "E164" };

export const INVALID_CONTACT_PHONE_MESSAGE =
  "Enter a valid phone number using a 10-digit Canada/US number or international +E.164 format.";

export class InvalidContactPhoneError extends Error {
  readonly code = "INVALID_CONTACT_PHONE" as const;

  constructor(message = INVALID_CONTACT_PHONE_MESSAGE) {
    super(message);
    this.name = "InvalidContactPhoneError";
  }
}

export function isInvalidContactPhoneError(
  error: unknown,
): error is InvalidContactPhoneError {
  return error instanceof InvalidContactPhoneError;
}

export function isE164(value: string | null | undefined): value is E164 {
  return typeof value === "string" && E164_PATTERN.test(value);
}

/**
 * Return a canonical +E.164 string, or null if the input is not safely parseable.
 */
export function normalizeToE164(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (isE164(trimmed)) return trimmed;

  if (/[a-z]/i.test(trimmed) && !trimmed.startsWith("+")) {
    return null;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (/^00[1-9]\d{7,14}$/.test(digits)) {
    const candidate = `+${digits.slice(2)}`;
    return isE164(candidate) ? candidate : null;
  }

  if (/^1[2-9]\d{9}$/.test(digits)) {
    return `+${digits}`;
  }

  if (/^[2-9]\d{9}$/.test(digits)) {
    return `+1${digits}`;
  }

  if (trimmed.startsWith("+")) {
    const candidate = `+${digits}`;
    return isE164(candidate) ? candidate : null;
  }

  return null;
}

export type PhoneColumnsForWrite = {
  phone?: string | null;
  phoneE164?: string | null;
};

export type ParsePhoneColumnsForWriteResult =
  | { ok: true; columns: PhoneColumnsForWrite }
  | { ok: false; error: string };

/**
 * Validate a phone write before touching the database.
 * Empty/null clears both columns. Unparseable non-empty values are rejected
 * so `User.phone` cannot drift from `User.phoneE164`.
 */
export function parsePhoneColumnsForWrite(
  raw: string | null | undefined,
): ParsePhoneColumnsForWriteResult {
  if (raw === undefined) return { ok: true, columns: {} };
  const phone = raw === null ? null : raw.trim() || null;
  if (!phone) return { ok: true, columns: { phone: null, phoneE164: null } };
  const phoneE164 = normalizeToE164(phone);
  if (!phoneE164) return { ok: false, error: INVALID_CONTACT_PHONE_MESSAGE };
  // Persist the site-wide display form; SMS still uses phoneE164.
  return {
    ok: true,
    columns: { phone: formatPhoneDisplay(phoneE164), phoneE164 },
  };
}

/** Prisma write helper: keep display `phone` and derived `phoneE164` in lockstep. */
export function phoneColumnsForWrite(
  raw: string | null | undefined,
): PhoneColumnsForWrite {
  const parsed = parsePhoneColumnsForWrite(raw);
  if (!parsed.ok) throw new InvalidContactPhoneError(parsed.error);
  return parsed.columns;
}

/**
 * Current communications destination.
 * Prefer a parseable displayed/contact phone so a leftover stored E.164 cannot
 * win after the number on the profile changed. If display is present but
 * unparseable, return null rather than sending/calling the stale stored value.
 * When display is empty, fall back to a valid stored E.164.
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

export function contactTelHref(
  phone: string | null | undefined,
  phoneE164: string | null | undefined,
): string | undefined {
  const e164 = resolveCommunicationsE164(phone, phoneE164);
  return e164 ? `tel:${e164}` : undefined;
}

export function contactSmsHref(
  phone: string | null | undefined,
  phoneE164: string | null | undefined,
): string | undefined {
  const e164 = resolveCommunicationsE164(phone, phoneE164);
  return e164 ? `sms:${e164}` : undefined;
}
