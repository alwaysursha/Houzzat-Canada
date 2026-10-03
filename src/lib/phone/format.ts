/**
 * Site-wide phone display: (647) 221 - 4949 for Canada/US NANP.
 * SMS / dial still use E.164 via {@link normalizeToE164} in `@/lib/sms/e164`.
 */

const NANP_DISPLAY = /^\((\d{3})\)\s(\d{3})\s-\s(\d{4})$/;

/** Digits only; strip a leading US/Canada country code when present. */
export function nanpLocalDigits(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  if (/^[2-9]\d{9}$/.test(digits)) return digits;
  return null;
}

function formatNanpLocal(local: string): string {
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)} - ${local.slice(6)}`;
}

/**
 * Canonical on-screen / stored display for NANP numbers.
 * Non-NANP +E.164-looking values keep a +digits form.
 * Unparseable input is returned trimmed (or empty).
 */
export function formatPhoneDisplay(
  raw: string | null | undefined,
): string {
  if (raw == null) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (NANP_DISPLAY.test(trimmed)) return trimmed;

  const local = nanpLocalDigits(trimmed);
  if (local) return formatNanpLocal(local);

  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+") && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  return trimmed;
}

/**
 * Progressive mask while typing / pasting Canada–US numbers.
 * Caps at 10 local digits. International (+ not +1) keeps a +digits form.
 */
export function formatPhoneAsYouType(raw: string | null | undefined): string {
  if (raw == null) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const hadPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);

  // International (not NANP): don't force the local mask.
  if (hadPlus && digits.length > 0 && !digits.startsWith("1")) {
    return `+${digits.slice(0, 15)}`;
  }

  if (digits.startsWith("1") && digits.length > 10) {
    digits = digits.slice(1);
  }
  digits = digits.slice(0, 10);

  const area = digits.slice(0, 3);
  const mid = digits.slice(3, 6);
  const last = digits.slice(6, 10);

  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${area}`;
  if (digits.length <= 6) return `(${area}) ${mid}`;
  return `(${area}) ${mid} - ${last}`;
}
