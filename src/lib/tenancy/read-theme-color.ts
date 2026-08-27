/** Read a resolved theme color from :root (for MapLibre paint props, etc.). */
export function readThemeColor(cssVar: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(cssVar)
    .trim();
  return raw || fallback;
}
