/**
 * Stage 3K.2 — strict workspace brand color validation (#RRGGBB only).
 */

export type BrandColorValidation =
  | { ok: true; value: string }
  | { ok: false; error: string };

const HEX6_RE = /^#[0-9A-Fa-f]{6}$/;

const FORBIDDEN_SUBSTRINGS = [
  "url(",
  "var(",
  "calc(",
  "rgb(",
  "hsl(",
  "rgba(",
  "hsla(",
] as const;

export function validateBrandColor(raw: string | null | undefined): BrandColorValidation {
  if (raw == null || raw === "") {
    return { ok: false, error: "color required" };
  }
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  for (const needle of FORBIDDEN_SUBSTRINGS) {
    if (lower.includes(needle)) {
      return { ok: false, error: `forbidden CSS in color: ${needle}` };
    }
  }
  if (!HEX6_RE.test(trimmed)) {
    return { ok: false, error: "color must be #RRGGBB" };
  }
  return { ok: true, value: trimmed.toUpperCase() };
}

/** Optional color — null/empty allowed; invalid rejects. */
export function validateOptionalBrandColor(
  raw: string | null | undefined,
): BrandColorValidation | { ok: true; value: string | null } {
  if (raw == null || raw.trim() === "") {
    return { ok: true, value: null };
  }
  return validateBrandColor(raw);
}

/** Relative luminance for contrast checks (WCAG). */
function luminance(hex: string): number {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const transform = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
}

export function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Returns true when primary on white meets WCAG AA for large text (3:1). */
export function primaryColorMeetsLargeTextAa(primary: string): boolean {
  return contrastRatio(primary, "#FFFFFF") >= 3;
}
