/** Stage 6.1 — prospect email normalization (service-layer contract). */

export function normalizeProspectEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
