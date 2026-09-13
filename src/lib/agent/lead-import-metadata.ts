/**
 * Client-safe CSV import metadata parsers (tags + source dates).
 * Do not import prisma / lead-intake. Tags never control Lead classification.
 */

export const IMPORTED_CRM_TAG_DELIMITERS = ", ; | newline tab" as const;

/** Comma, semicolon, pipe, newline, tab. Space is not a delimiter. */
const TAG_SPLIT_RE = /[,;|\n\r\t]+/;

export type ImportedCrmTag = {
  /** First-seen trimmed display text. */
  name: string;
  nameNormalized: string;
};

export function normalizeImportedTagName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export function parseImportedCrmTags(
  raw: string | null | undefined,
): ImportedCrmTag[] {
  const value = raw?.trim() ?? "";
  if (!value) return [];
  const seen = new Set<string>();
  const tags: ImportedCrmTag[] = [];
  for (const part of value.split(TAG_SPLIT_RE)) {
    const name = part.trim();
    if (!name) continue;
    const nameNormalized = normalizeImportedTagName(name);
    if (!nameNormalized || seen.has(nameNormalized)) continue;
    seen.add(nameNormalized);
    tags.push({ name, nameNormalized });
  }
  return tags;
}

export type ParsedImportedCrmDate =
  | { ok: true; at: Date; raw: string }
  | { ok: false; raw: string };

function utcDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const at = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    at.getUTCFullYear() !== year ||
    at.getUTCMonth() !== month - 1 ||
    at.getUTCDate() !== day
  ) {
    return null;
  }
  return at;
}

function parseIsoLikeDate(value: string): Date | null {
  const iso = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/,
  );
  if (!iso) return null;
  return utcDate(
    Number(iso[1]),
    Number(iso[2]),
    Number(iso[3]),
    iso[4] ? Number(iso[4]) : 0,
    iso[5] ? Number(iso[5]) : 0,
    iso[6] ? Number(iso[6]) : 0,
  );
}

function parseYmdSlashes(value: string): Date | null {
  const ymd = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!ymd) return null;
  return utcDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
}

function parseAmbiguousSlashDate(value: string): Date | null {
  const slash = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!slash) return null;
  const a = Number(slash[1]);
  const b = Number(slash[2]);
  const year = Number(slash[3]);
  if (a > 12 && b <= 12) return utcDate(year, b, a);
  if (b > 12 && a <= 12) return utcDate(year, a, b);
  return null;
}

/**
 * Conservative CRM date parse. Ambiguous 01/02/2024 is unrecognized.
 * Invalid/unrecognized callers must keep the raw string in unmappedFields.
 */
export function parseImportedCrmDate(
  raw: string | null | undefined,
): ParsedImportedCrmDate | null {
  const value = raw?.trim() ?? "";
  if (!value) return null;
  const iso = parseIsoLikeDate(value);
  if (iso) return { ok: true, at: iso, raw: value };
  const ymd = parseYmdSlashes(value);
  if (ymd) return { ok: true, at: ymd, raw: value };
  const slash = parseAmbiguousSlashDate(value);
  if (slash) return { ok: true, at: slash, raw: value };
  return { ok: false, raw: value };
}

export function deferredValue(
  deferred: ReadonlyArray<{ field: string; value: string }> | undefined,
  field: string,
): string | undefined {
  const found = deferred?.find((item) => item.field === field);
  const value = found?.value?.trim() ?? "";
  return value || undefined;
}
