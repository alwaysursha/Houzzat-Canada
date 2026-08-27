/**
 * Stage 3K.5.5.3 — request-scoped tenant favicon resolution + SVG generation.
 */
import type { Metadata } from "next";
import { validateBrandColor } from "@/lib/tenancy/brand-colors";
import type { MarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";
import { absoluteUrlForOrigin } from "@/lib/tenancy/resolve-trusted-request-origin";

const GENERATED_FAVICON_PATH = "/api/tenancy/favicon";
const SAFE_INITIAL_RE = /^[A-Z0-9]$/;
const FALLBACK_PRIMARY = "#6B7280";

/** Versioned API path — cache bust when WorkspaceBranding.version changes. */
export function tenantFaviconApiHref(version: number): string {
  const v = Number.isFinite(version) && version >= 0 ? Math.floor(version) : 0;
  return `${GENERATED_FAVICON_PATH}?v=${v}`;
}

export function resolveTenantFaviconHref(
  brand: Pick<MarketingPresentationBrand, "faviconUrl" | "version">,
): string {
  const custom = brand.faviconUrl?.trim();
  if (custom) return custom;
  return tenantFaviconApiHref(brand.version);
}

export function resolveTenantFaviconMetadata(
  brand: MarketingPresentationBrand,
  canonicalOrigin: string,
): NonNullable<Metadata["icons"]> {
  const href = resolveTenantFaviconHref(brand);
  const iconUrl =
    href.startsWith("http")
      ? href
      : absoluteUrlForOrigin(canonicalOrigin, href) ?? href;
  const isGenerated = href.startsWith(GENERATED_FAVICON_PATH);

  return {
    icon: [
      {
        url: iconUrl,
        type: isGenerated ? "image/svg+xml" : undefined,
      },
    ],
    shortcut: iconUrl,
    apple: iconUrl,
  };
}

/** Safe single-character mark for SVG — never injects raw displayName. */
export function safeFaviconInitial(displayName: string): string {
  const candidate = displayName.trim().charAt(0).toUpperCase();
  if (SAFE_INITIAL_RE.test(candidate)) return candidate;
  return "R";
}

export function resolveFaviconPrimaryColor(raw: string | null | undefined): string {
  const result = validateBrandColor(raw ?? "");
  return result.ok ? result.value : FALLBACK_PRIMARY;
}

/**
 * Deterministic neutral tenant mark: rounded square + initial letter.
 * No scripts, external refs, or user-controlled markup.
 */
export function buildGeneratedTenantFaviconSvg(input: {
  primaryColor: string;
  initial: string;
}): string {
  const fill = resolveFaviconPrimaryColor(input.primaryColor);
  const initial = SAFE_INITIAL_RE.test(input.initial) ? input.initial : "R";

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-hidden="true">',
    `<rect width="32" height="32" rx="7" fill="${fill}"/>`,
    `<text x="16" y="22" font-family="system-ui,-apple-system,sans-serif" font-size="17" font-weight="700" fill="#FFFFFF" text-anchor="middle">${initial}</text>`,
    "</svg>",
  ].join("");
}

export function faviconResponseCacheControl(): string {
  return "public, max-age=3600, stale-while-revalidate=86400";
}
