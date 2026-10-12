/**
 * Houzzat listing URL detection + authorized preview helpers for chat.
 * Resolves via listing-share / panel infrastructure — never scrapes HTML.
 */

import { mlsNumberFromListingPath } from "@/lib/listings/listing-path";
import type { ListingSharePresentView } from "@/lib/conversations/listing-share/payload";

const LISTING_HOST_RE =
  /^(?:www\.)?(?:houzzat\.com|houzzatpro\.com|[a-z0-9-]+\.houzzat\.com|[a-z0-9-]+\.houzzatpro\.com)$/i;

/** Absolute http(s)/www and protocol-relative URL-like tokens. */
const URL_LIKE_RE =
  /https?:\/\/[^\s<>"'`]+|\/\/[^\s<>"'`]+|www\.[^\s<>"'`]+/gi;

/**
 * Relative `/listing/...` only when token-bounded (not inside a host/path of a
 * foreign absolute or protocol-relative URL).
 */
const RELATIVE_LISTING_RE =
  /(?:^|[\s"'<>(\[{,;:])(\/listing\/[^\s<>"'`?#]+)/i;

export const CHAT_LISTING_URL_PREVIEW_ROUTE = "/api/chat/listing-url-preview";
export const CHAT_LISTING_URL_PREVIEW_DEBOUNCE_MS = 350;

export type ChatListingUrlPreviewResponse =
  | {
      ok: true;
      shareable: boolean;
      listingId: string;
      mlsNumber: string;
      hostname: string;
      preview: ListingSharePresentView;
    }
  | {
      ok: false;
      reason:
        | "INVALID"
        | "NOT_FOUND"
        | "UNAUTHORIZED"
        | "RESTRICTED"
        | "UNAVAILABLE";
      message: string;
    };

export function isHouzzatListingHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^www\./, "");
  if (typeof window !== "undefined") {
    const current = window.location.hostname.replace(/^www\./, "").toLowerCase();
    if (host === current) return true;
  }
  return LISTING_HOST_RE.test(host);
}

function normalizeHref(raw: string): string | null {
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

/** Relative `/listing/...` or absolute Houzzat/same-origin listing URL → MLS. */
export function mlsNumberFromChatListingUrl(
  hrefOrPath: string | null | undefined,
): string | null {
  if (!hrefOrPath?.trim()) return null;
  const raw = hrefOrPath.trim();
  try {
    if (raw.startsWith("/listing/")) {
      const mls = mlsNumberFromListingPath(raw.split(/[?#]/)[0] ?? raw);
      return mls ? mls.toUpperCase() : null;
    }
    const href = normalizeHref(raw);
    if (!href) return null;
    const url = new URL(href);
    const hostOk =
      isHouzzatListingHostname(url.hostname) ||
      LISTING_HOST_RE.test(url.hostname.replace(/^www\./i, ""));
    if (!hostOk) return null;
    const mls = mlsNumberFromListingPath(url.pathname);
    return mls ? mls.toUpperCase() : null;
  } catch {
    return null;
  }
}

/**
 * Mask absolute / protocol-relative URL-like spans so a rejected foreign URL
 * cannot later contribute a bare `/listing/...` substring.
 */
function maskUrlLikeSpans(text: string): string {
  return text.replace(URL_LIKE_RE, (match) => " ".repeat(match.length));
}

export function extractChatListingMls(
  text: string | null | undefined,
): { mlsNumber: string; href: string; hostname: string } | null {
  if (!text?.trim()) return null;

  // 1) Absolute / www tokens — accept only when host allowlist passes.
  URL_LIKE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_LIKE_RE.exec(text)) != null) {
    const raw = match[0];
    // Protocol-relative foreign hosts are never Houzzat listing links.
    if (raw.startsWith("//")) continue;
    const href = normalizeHref(raw);
    if (!href) continue;
    const mls = mlsNumberFromChatListingUrl(href);
    if (!mls) continue;
    try {
      const hostname = new URL(href).hostname.replace(/^www\./i, "");
      return { mlsNumber: mls, href, hostname };
    } catch {
      return { mlsNumber: mls, href, hostname: "houzzat.com" };
    }
  }

  // 2) Genuine relative `/listing/...` only outside masked URL-like spans.
  const masked = maskUrlLikeSpans(text);
  const relative = masked.match(RELATIVE_LISTING_RE);
  const bare = relative?.[1]?.split(/[?#]/)[0] ?? null;
  if (bare) {
    const mls = mlsNumberFromChatListingUrl(bare);
    if (mls) {
      return {
        mlsNumber: mls,
        href: bare,
        hostname:
          typeof window !== "undefined"
            ? window.location.hostname.replace(/^www\./, "")
            : "houzzat.com",
      };
    }
  }
  return null;
}

/** True when the message body is essentially just a listing URL (no other prose). */
export function isListingUrlOnlyBody(body: string | null | undefined): boolean {
  if (!body?.trim()) return false;
  const trimmed = body.trim();
  const extracted = extractChatListingMls(trimmed);
  if (!extracted) return false;
  const withoutUrl = trimmed
    .replace(extracted.href, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/www\.\S+/gi, "")
    .replace(/\/listing\/\S+/gi, "")
    .trim();
  return withoutUrl.length === 0;
}

export function chatListingUrlPreviewUrl(mlsNumber: string): string {
  const params = new URLSearchParams();
  params.set("mlsNumber", mlsNumber.trim().toUpperCase());
  return `${CHAT_LISTING_URL_PREVIEW_ROUTE}?${params.toString()}`;
}
