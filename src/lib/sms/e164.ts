/**
 * Conservative E.164 normalization for HouzzatPRO SMS.
 * Does not invent a country for ambiguous/international local formats.
 * NANP 10-digit numbers default to +1 (Canada/US operating region).
 */

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export type E164 = string & { readonly __brand: "E164" };

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

/** Prisma write helper: keep display `phone` and derived `phoneE164` in lockstep. */
export function phoneColumnsForWrite(
  raw: string | null | undefined,
): { phone?: string | null; phoneE164?: string | null } {
  if (raw === undefined) return {};
  const phone = raw === null ? null : raw.trim() || null;
  return {
    phone,
    phoneE164: phone ? normalizeToE164(phone) : null,
  };
}
