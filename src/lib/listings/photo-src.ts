/**
 * Normalize listing photo URLs for Next/Image.
 * Known AMPRE CDNs load directly; unknown / auth-gated hosts go through the proxy.
 */
const DIRECT_HOST_SUFFIXES = [
  "images.unsplash.com",
  "ampre.ca",
  "ampre.us",
  "cloudfront.net",
  "amazonaws.com",
  "realtor.ca",
  "trreb.ca",
  "trlreb.ca",
  "listhub.net",
  "axl.realtor",
] as const;

function isDirectHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return DIRECT_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

export function listingPhotoSrc(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    if (parsed.pathname.startsWith("/api/listings/photo")) {
      return trimmed;
    }
    if (isDirectHost(parsed.hostname)) {
      return trimmed;
    }
    return `/api/listings/photo?src=${encodeURIComponent(trimmed)}`;
  } catch {
    if (trimmed.startsWith("/")) return trimmed;
    return null;
  }
}
