/**
 * Stage 3K.5.5 — request-aware SEO/metadata from workspace branding.
 */
import type { Metadata } from "next";
import type { MarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";
import type { RequestTenancySuccess } from "@/lib/tenancy/resolve-request-tenancy";
import { absoluteUrlForOrigin } from "@/lib/tenancy/resolve-trusted-request-origin";
import { toMarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";
import { HOUZZAT_OFFICIAL_LOGO_PATH } from "@/lib/tenancy/legacy-houzzat-brand";
import { resolveTenantFaviconMetadata } from "@/lib/tenancy/tenant-favicon";
import { HIGH_OCTANE_FAVICON_URL } from "@/lib/tenancy/templates/resolve-royal-collection-view";
import {
  HIGH_OCTANE_STAGING_AREA_SERVED,
  HIGH_OCTANE_STAGING_SEO_TITLE_SUFFIX,
  HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
} from "@/lib/tenancy/templates/high-octane-staging-slug";

function isHighOctaneStagingBrand(brand: { workspaceSlug: string }): boolean {
  return brand.workspaceSlug === HIGH_OCTANE_STAGING_WORKSPACE_SLUG;
}

function marketingTitle(brand: { workspaceSlug: string; displayName: string }): string {
  const suffix = isHighOctaneStagingBrand(brand)
    ? HIGH_OCTANE_STAGING_SEO_TITLE_SUFFIX
    : "GTA Homes for Sale & Open Houses";
  return `${brand.displayName} | ${suffix}`;
}

function marketingAreaServed(brand: { workspaceSlug: string }) {
  if (isHighOctaneStagingBrand(brand)) {
    return [
      { "@type": "AdministrativeArea", name: HIGH_OCTANE_STAGING_AREA_SERVED },
      { "@type": "AdministrativeArea", name: "Ontario" },
    ];
  }
  return [
    { "@type": "AdministrativeArea", name: "Greater Toronto Area" },
    { "@type": "AdministrativeArea", name: "Ontario" },
  ];
}

function metadataBase(origin: string): URL {
  return new URL(origin.endsWith("/") ? origin : `${origin}/`);
}

function marketingIcons(
  brand: MarketingPresentationBrand,
  canonicalOrigin: string,
) {
  if (brand.isHouzzatWorkspace) {
    return resolveTenantFaviconMetadata(
      { ...brand, faviconUrl: HOUZZAT_OFFICIAL_LOGO_PATH },
      canonicalOrigin,
    );
  }
  if (isHighOctaneStagingBrand(brand)) {
    return {
      icon: [{ url: HIGH_OCTANE_FAVICON_URL, type: "image/svg+xml" }],
      shortcut: HIGH_OCTANE_FAVICON_URL,
      apple: HIGH_OCTANE_FAVICON_URL,
    };
  }
  return resolveTenantFaviconMetadata(brand, canonicalOrigin);
}

function defaultOgImage(brand: MarketingPresentationBrand) {
  const imagePath = brand.isHouzzatWorkspace
    ? HOUZZAT_OFFICIAL_LOGO_PATH
    : brand.ogImageUrl ?? brand.logoUrl ?? null;
  if (!imagePath) {
    return null;
  }
  const url =
    imagePath.startsWith("http")
      ? imagePath
      : absoluteUrlForOrigin(brand.canonicalOrigin, imagePath) ??
        absoluteUrlForOrigin(brand.publicOrigin, imagePath);
  return {
    url: url ?? imagePath,
    width: 512,
    height: 512,
    alt: isHighOctaneStagingBrand(brand)
      ? `${brand.displayName} — Niagara homes for sale`
      : `${brand.displayName} — GTA homes for sale`,
  };
}

export function buildMarketingRootMetadata(
  tenancy: RequestTenancySuccess,
  canonicalOrigin: string,
): Metadata {
  const brand = toMarketingPresentationBrand(tenancy, canonicalOrigin);
  const base = metadataBase(canonicalOrigin);
  const homeUrl = absoluteUrlForOrigin(canonicalOrigin, "/") ?? canonicalOrigin;
  const defaultTitle = marketingTitle(brand);
  const ogImage = defaultOgImage(brand);

  return {
    metadataBase: base,
    title: {
      default: defaultTitle,
      absolute: defaultTitle,
      template: `%s | ${brand.displayName}`,
    },
    description: brand.seoDescription,
    applicationName: brand.displayName,
    alternates: { canonical: homeUrl },
    icons: marketingIcons(brand, canonicalOrigin),
    openGraph: {
      type: "website",
      locale: "en_CA",
      siteName: brand.displayName,
      title: defaultTitle,
      description: brand.seoDescription,
      url: homeUrl,
      images: ogImage ? [ogImage] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: defaultTitle,
      description: brand.seoDescription,
      images: ogImage ? [ogImage.url] : undefined,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

export function buildTenantPublicPageMetadata(input: {
  tenancy: RequestTenancySuccess;
  canonicalOrigin: string;
  title: string;
  description: string;
  path: string;
}): Metadata {
  const brand = toMarketingPresentationBrand(
    input.tenancy,
    input.canonicalOrigin,
  );
  const url =
    absoluteUrlForOrigin(input.canonicalOrigin, input.path) ??
    absoluteUrlForOrigin(brand.publicOrigin, input.path);
  const ogImage = defaultOgImage(brand);

  return {
    title: input.title,
    description: input.description,
    alternates: url ? { canonical: url } : undefined,
    icons: marketingIcons(brand, input.canonicalOrigin),
    openGraph: {
      title: input.title,
      description: input.description,
      url: url ?? undefined,
      siteName: brand.displayName,
      type: "website",
      locale: "en_CA",
      images: ogImage ? [ogImage] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      images: ogImage ? [ogImage.url] : undefined,
    },
  };
}

export function organizationJsonLdForTenancy(
  tenancy: RequestTenancySuccess,
  canonicalOrigin: string,
  input?: { telephone?: string | null },
) {
  const brand = tenancy.brand;
  const presentation = toMarketingPresentationBrand(tenancy, canonicalOrigin);
  const origin = canonicalOrigin;
  const home = absoluteUrlForOrigin(origin, "/") ?? origin;
  const logoPath = presentation.isHouzzatWorkspace
    ? HOUZZAT_OFFICIAL_LOGO_PATH
    : brand.logoUrl ?? brand.ogImageUrl ?? null;
  const logo = logoPath
    ? logoPath.startsWith("http")
      ? logoPath
      : absoluteUrlForOrigin(origin, logoPath) ?? logoPath
    : undefined;
  const telephone = input?.telephone?.trim() || brand.contact.phone || undefined;

  return {
    "@context": "https://schema.org",
    "@type": ["Organization", "RealEstateAgent"],
    "@id": `${home}#organization`,
    name: brand.displayName,
    url: home,
    ...(logo ? { logo, image: logo } : {}),
    description: brand.seoDescription,
    areaServed: marketingAreaServed(presentation),
    ...(telephone
      ? {
          telephone: telephone.startsWith("+")
            ? telephone
            : `+${telephone.replace(/\D/g, "")}`,
          contactPoint: {
            "@type": "ContactPoint",
            contactType: "customer service",
            telephone: telephone.startsWith("+")
              ? telephone
              : `+${telephone.replace(/\D/g, "")}`,
            areaServed: "CA",
            availableLanguage: ["English"],
          },
        }
      : {}),
  };
}
