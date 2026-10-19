/**
 * Inbox preview (preheader) helpers for HTML email.
 *
 * Gmail and other clients pull a short snippet from early HTML text. When the
 * hidden preheader is missing or duplicates the subject/H1, the hero title
 * becomes the preview — which is why agent emails often show the same line
 * twice in the inbox.
 */

export const EMAIL_PREHEADER_MAX_CHARS = 120;
export const EMAIL_PREHEADER_TARGET_MIN_CHARS = 70;

/** Zero-width / nbsp filler so clients do not append the H1 after a short preview. */
const PREHEADER_PAD =
  "\u00A0\u200C\u00A0\u200C\u00A0\u200C\u00A0\u200C\u00A0\u200C".repeat(18);

const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export type ResolveEmailPreheaderInput = {
  /** Preferred preview when already meaningful and not a subject/title echo. */
  explicit?: string | null;
  subject?: string | null;
  title?: string | null;
  subtitle?: string | null;
  brandLabel?: string | null;
  /** Legal / powered-by footer — never used as preview source. */
  footerNote?: string | null;
  /** Prefer plain body when available (agent-authored messages). */
  bodyText?: string | null;
  bodyHtml?: string | null;
  maxChars?: number;
};

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => {
      const code = Number.parseInt(h, 16);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : "";
    })
    .replace(/&([a-z]+);/gi, (match, name: string) => {
      const mapped = ENTITY_MAP[name.toLowerCase()];
      return mapped ?? match;
    });
}

/** Collapse whitespace and normalize dashes/quotes for comparison. */
export function normalizeEmailPreheaderKey(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function stripHtmlToEmailPreviewText(html: string | null | undefined): string {
  if (!html) return "";
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|tr|h[1-6]|li|br|table|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  text = decodeBasicEntities(text);
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function stripLeadingSalutation(text: string): string {
  return text
    .replace(/^(hi|hello|hey|dear)\b[^,\n]{0,80},\s*/i, "")
    .replace(/^(hi|hello|hey|dear)\b\s+(there|all|team)\s*[,!]?\s*/i, "")
    .trim();
}

function stripRejectedPhrases(
  text: string,
  rejected: Array<string | null | undefined>,
): string {
  let out = text;
  for (const raw of rejected) {
    const key = normalizeEmailPreheaderKey(raw);
    if (!key || key.length < 3) continue;
    // Remove exact line / leading echo of subject/title/brand/footer lines.
    const lines = out.split("\n");
    out = lines
      .map((line) => {
        const n = normalizeEmailPreheaderKey(line);
        if (!n) return "";
        if (n === key) return "";
        if (n.startsWith(key) && n.length <= key.length + 8) return "";
        return line;
      })
      .filter(Boolean)
      .join("\n");
  }
  return out.trim();
}

function truncateAtWordBoundary(text: string, maxChars: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxChars) return collapsed;
  const slice = collapsed.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  const cut =
    lastSpace >= Math.floor(maxChars * 0.55) ? slice.slice(0, lastSpace) : slice;
  return cut.replace(/[.,;:!\-–—]+\s*$/, "").trim();
}

function isEchoOf(
  candidate: string,
  other: string | null | undefined,
): boolean {
  const a = normalizeEmailPreheaderKey(candidate);
  const b = normalizeEmailPreheaderKey(other);
  if (!a || !b) return false;
  if (a === b) return true;
  // Subject/title is a near-prefix of the preview (or vice versa).
  if (a.startsWith(b) && a.length - b.length <= 12) return true;
  if (b.startsWith(a) && b.length - a.length <= 12) return true;
  return false;
}

function isUsablePreview(
  candidate: string,
  input: ResolveEmailPreheaderInput,
): boolean {
  const trimmed = candidate.replace(/\s+/g, " ").trim();
  if (trimmed.length < 12) return false;
  if (isEchoOf(trimmed, input.subject)) return false;
  if (isEchoOf(trimmed, input.title)) return false;
  if (isEchoOf(trimmed, input.brandLabel)) return false;
  const footerKey = normalizeEmailPreheaderKey(input.footerNote);
  const candKey = normalizeEmailPreheaderKey(trimmed);
  if (footerKey && (candKey === footerKey || footerKey.startsWith(candKey))) {
    return false;
  }
  // Reject pure brand / legal crumbs.
  if (/^(houzzat|houzzatpro|powered by)\b/i.test(trimmed) && trimmed.length < 40) {
    return false;
  }
  return true;
}

function prepareCandidate(
  raw: string | null | undefined,
  input: ResolveEmailPreheaderInput,
  opts?: { stripSalutation?: boolean },
): string {
  if (!raw) return "";
  let text = decodeBasicEntities(raw);
  text = text.replace(/\u00A0/g, " ");
  if (opts?.stripSalutation !== false) {
    text = stripLeadingSalutation(text);
  }
  text = stripRejectedPhrases(text, [
    input.subject,
    input.title,
    input.brandLabel,
    ...(input.footerNote ?? "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  ]);
  text = text.replace(/\s+/g, " ").trim();
  const max = input.maxChars ?? EMAIL_PREHEADER_MAX_CHARS;
  return truncateAtWordBoundary(text, max);
}

/**
 * Resolve concise inbox preview text.
 * Prefers an explicit preview; otherwise derives from body (then subtitle).
 */
export function resolveEmailPreheader(input: ResolveEmailPreheaderInput): string {
  const max = input.maxChars ?? EMAIL_PREHEADER_MAX_CHARS;
  const withMax = { ...input, maxChars: max };

  const explicit = prepareCandidate(input.explicit, withMax, {
    stripSalutation: false,
  });
  if (explicit && isUsablePreview(explicit, withMax)) {
    return explicit;
  }

  const fromBodyText = prepareCandidate(input.bodyText, withMax);
  if (fromBodyText && isUsablePreview(fromBodyText, withMax)) {
    return fromBodyText;
  }

  const fromHtml = prepareCandidate(stripHtmlToEmailPreviewText(input.bodyHtml), withMax);
  if (fromHtml && isUsablePreview(fromHtml, withMax)) {
    return fromHtml;
  }

  const fromSubtitle = prepareCandidate(input.subtitle, withMax, {
    stripSalutation: false,
  });
  if (fromSubtitle && isUsablePreview(fromSubtitle, withMax)) {
    return fromSubtitle;
  }

  return "";
}

/**
 * Email-safe hidden preheader HTML. Escaped text + filler so clients do not
 * leak the H1 into the inbox snippet. Produces no visible layout spacing.
 */
export function formatHiddenEmailPreheaderHtml(
  preheader: string,
  escapeHtml: (value: string) => string,
): string {
  const text = preheader.replace(/\s+/g, " ").trim();
  if (!text) return "";
  const safe = escapeHtml(text);
  return `<div style="display:none !important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;color:transparent">${safe}${PREHEADER_PAD}</div>`;
}
