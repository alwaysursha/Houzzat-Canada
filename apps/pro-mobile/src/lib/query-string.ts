/**
 * Hermes/RN-safe query string builder.
 * React Native's URLSearchParams only implements append — not set/get/has.
 */

export function buildQueryString(
  entries: Record<string, string | number | boolean | undefined | null>,
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined || value === null || value === "") continue;
    parts.push(
      `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    );
  }
  return parts.join("&");
}

export function withQuery(
  path: string,
  entries: Record<string, string | number | boolean | undefined | null>,
): string {
  const qs = buildQueryString(entries);
  return qs ? `${path}?${qs}` : path;
}
