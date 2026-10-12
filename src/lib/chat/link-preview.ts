/**
 * Client-safe URL detection for chat composers and message bodies.
 * No privileged server-side OG fetch — external previews are domain-only.
 * Houzzat listing URLs are resolved via authorized listing-url-preview API.
 */

import {
  extractChatListingMls,
  mlsNumberFromChatListingUrl,
} from "@/lib/chat/listing-url-preview";

const URL_RE =
  /https?:\/\/[^\s<>"'`]+|www\.[^\s<>"'`]+/gi;

export type ChatDetectedUrl = {
  raw: string;
  href: string;
  hostname: string;
};

export type ChatComposerLinkPreview = {
  href: string;
  hostname: string;
  kind: "listing" | "external";
  /** Relative listing path when kind === "listing". */
  listingPath: string | null;
  /** MLS® # when kind === "listing". */
  mlsNumber: string | null;
  title: string;
  description: string | null;
};

export function normalizeDetectedHref(raw: string): string | null {
  const trimmed = raw.trim().replace(/[),.!?;:]+$/g, "");
  if (!trimmed) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function extractChatUrls(text: string | null | undefined): ChatDetectedUrl[] {
  if (!text) return [];
  const matches = text.match(URL_RE) ?? [];
  const out: ChatDetectedUrl[] = [];
  const seen = new Set<string>();
  for (const raw of matches) {
    const href = normalizeDetectedHref(raw);
    if (!href) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    try {
      const hostname = new URL(href).hostname.replace(/^www\./i, "");
      out.push({ raw, href, hostname });
    } catch {
      // skip
    }
  }
  return out;
}

export function extractFirstChatUrl(
  text: string | null | undefined,
): ChatDetectedUrl | null {
  return extractChatUrls(text)[0] ?? null;
}

/** `/listing/...` on current origin or known Houzzat hosts. */
export function parseHouzzatListingPath(href: string): string | null {
  const mls = mlsNumberFromChatListingUrl(href);
  if (!mls) return null;
  try {
    if (href.startsWith("/listing/")) {
      return href.split(/[?#]/)[0] ?? href;
    }
    const url = new URL(normalizeDetectedHref(href) ?? href);
    return url.pathname;
  } catch {
    return null;
  }
}

export function buildComposerLinkPreview(
  text: string | null | undefined,
): ChatComposerLinkPreview | null {
  const listing = extractChatListingMls(text);
  if (listing) {
    return {
      href: listing.href,
      hostname: listing.hostname,
      kind: "listing",
      listingPath: parseHouzzatListingPath(listing.href),
      mlsNumber: listing.mlsNumber,
      title: `Listing ${listing.mlsNumber}`,
      description: "Houzzat property listing",
    };
  }
  const first = extractFirstChatUrl(text);
  if (!first) return null;
  return {
    href: first.href,
    hostname: first.hostname,
    kind: "external",
    listingPath: null,
    mlsNumber: null,
    title: first.hostname,
    description: "Link preview — open to view",
  };
}

/** Safe external navigation attributes. */
export function chatExternalLinkProps(href: string): {
  href: string;
  target: "_blank";
  rel: "noopener noreferrer";
} {
  return {
    href,
    target: "_blank",
    rel: "noopener noreferrer",
  };
}
