import type { Metadata } from "next";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/constants";

/** Absolute public URL for a site path. */
export function absoluteUrl(path = "/"): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const base = SITE_URL.replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized === "/" ? "" : normalized}` || base;
}

export const DEFAULT_OG_IMAGE = {
  url: absoluteUrl("/icon.png"),
  width: 512,
  height: 512,
  alt: `${SITE_NAME} — GTA homes for sale`,
};

/** Shared root metadata defaults (Open Graph, Twitter, robots, metadataBase). */
export function buildRootMetadata(): Metadata {
  const url = absoluteUrl("/");
  return {
    metadataBase: new URL(SITE_URL.endsWith("/") ? SITE_URL : `${SITE_URL}/`),
    title: {
      default: `${SITE_NAME} | GTA Homes for Sale & Open Houses`,
      template: `%s | ${SITE_NAME}`,
    },
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "en_CA",
      siteName: SITE_NAME,
      title: `${SITE_NAME} | GTA Homes for Sale & Open Houses`,
      description: SITE_DESCRIPTION,
      url,
      images: [DEFAULT_OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: `${SITE_NAME} | GTA Homes for Sale & Open Houses`,
      description: SITE_DESCRIPTION,
      images: [DEFAULT_OG_IMAGE.url],
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

export function noIndexMetadata(title: string): Metadata {
  return {
    title,
    robots: { index: false, follow: false, nocache: true },
  };
}

/** Indexable marketing page with canonical + OG/Twitter. */
export function publicPageMetadata(input: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = absoluteUrl(input.path);
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: url },
    openGraph: {
      title: input.title,
      description: input.description,
      url,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_CA",
      images: [DEFAULT_OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      images: [DEFAULT_OG_IMAGE.url],
    },
  };
}

/** Organization / RealEstateAgent entity for brand + local SEO. */
export function organizationJsonLd(input?: {
  telephone?: string | null;
}) {
  const telephone = input?.telephone?.trim() || undefined;
  return {
    "@context": "https://schema.org",
    "@type": ["Organization", "RealEstateAgent"],
    "@id": `${absoluteUrl("/")}#organization`,
    name: SITE_NAME,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/icon.png"),
    image: absoluteUrl("/icon.png"),
    description: SITE_DESCRIPTION,
    areaServed: [
      {
        "@type": "AdministrativeArea",
        name: "Greater Toronto Area",
      },
      {
        "@type": "AdministrativeArea",
        name: "Ontario",
      },
    ],
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

export function breadcrumbJsonLd(
  items: Array<{ name: string; path: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}
