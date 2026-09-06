/**
 * Stage 6.11B.4 — presentation-only community label cleanup.
 * Strips leading board/database codes (e.g. "05 - Gananoque" → "Gananoque").
 * Does NOT mutate GeoPlace or affect routing/search keys.
 */
export function formatCommunityDisplayName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  return trimmed.replace(/^\d+\s*[-–—]\s*/u, "").trim() || trimmed;
}
