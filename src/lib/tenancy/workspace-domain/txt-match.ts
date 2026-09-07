/**
 * Stage 6.11F.2A — TXT answer normalization + exact token matching.
 */

import { timingSafeEqual } from "node:crypto";

/**
 * Strip DNS TXT quotation / chunk formatting to a comparable string.
 * Does not alter token case — comparison remains exact.
 */
export function normalizeDnsTxtAnswer(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const quotedChunks = [
    ...trimmed.matchAll(/"((?:\\.|[^"\\])*)"/g),
  ].map((match) => match[1]!.replace(/\\"/g, '"').replace(/\\\\/g, "\\"));

  if (quotedChunks.length > 0) {
    return quotedChunks.join("").trim();
  }

  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith("`") && trimmed.endsWith("`"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

/** Exact equality with timing-safe compare when lengths match. */
export function ownershipTokensEqual(
  expectedToken: string,
  candidate: string,
): boolean {
  const a = Buffer.from(expectedToken, "utf8");
  const b = Buffer.from(candidate, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * True when any TXT answer exactly equals the expected verification token
 * after safe quote/whitespace normalization (not case-folding).
 */
export function txtAnswersMatchOwnershipToken(
  answers: readonly string[],
  expectedToken: string,
): boolean {
  if (!expectedToken) return false;
  for (const answer of answers) {
    const normalized = normalizeDnsTxtAnswer(answer);
    if (ownershipTokensEqual(expectedToken, normalized)) {
      return true;
    }
  }
  return false;
}
