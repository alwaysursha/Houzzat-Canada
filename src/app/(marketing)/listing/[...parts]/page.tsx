import { cache } from "react";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ListingDetailView } from "@/components/listings/ListingDetailView";
import {
  resolveListingDetailAccess,
  serializeListingDetailClientModel,
} from "@/lib/listings/build-listing-panel";
import { formatListingAddressOneLine } from "@/lib/listings/constants";
import { NEON_LISTING_MEDIA_CAP } from "@/lib/listings/gallery-constants";
import { loadListingForDetailPage } from "@/lib/listings/load-listing-for-detail";
import { persistNeonListingMediaCap } from "@/lib/listings/persist-neon-media";
import { resolveListingGalleryPhotos } from "@/lib/listings/resolve-gallery";
import { fetchListingPhotosFromPropTx } from "@/lib/proptx/listing-photos";
import { auth } from "@/lib/auth";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";
import { needsEmailVerification } from "@/lib/account-access";
import {
  resolveListingEntitlementContextForServerPage,
} from "@/lib/tenancy/listing-entitlement";
import { resolveMarketingTenancy } from "@/lib/tenancy/resolve-marketing-tenancy";
import { resolveMarketingWhatsAppNumber } from "@/lib/tenancy/resolve-tenant-whatsapp";
import { resolveCanonicalPublicOrigin } from "@/lib/tenancy/canonical-public-origin";
import { absoluteUrlForOrigin } from "@/lib/tenancy/resolve-trusted-request-origin";
import { buildTenantPublicPageMetadata } from "@/lib/tenancy/tenant-seo";
import {
  homesForSaleCityPath,
  homesForSaleCommunityPath,
} from "@/lib/geo/area-seo";
import {
  listingAddressSlug,
  listingPageTitle,
  listingPath,
} from "@/lib/listings/listing-path";

/** Per-request: VOW/IDX gates, sold/history redaction, session access. */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ parts: string[] }> };

/**
 * Single catch-all avoids OpenNext/Workerd route collisions from sibling
 * dynamic segments (`/listing/[mls]` + `/listing/[slug]/[mls]`).
 *
 * - `/listing/X13637722` → 301 to canonical slug path
 * - `/listing/161-eden-oak-trail-kitchener/X13637722` → detail page
 */
function parseListingParts(parts: string[] | undefined): {
  slug: string | null;
  mlsNumber: string;
} {
  if (!parts || parts.length === 0 || parts.length > 2) {
    notFound();
  }
  if (parts.length === 1) {
    return { slug: null, mlsNumber: parts[0]! };
  }
  return { slug: parts[0]!, mlsNumber: parts[1]! };
}

/**
 * Hostname → G.7C/G.10A once per request (shared by metadata + page).
 * Never reads client workspaceId / org / provider.
 */
const resolveListingDetailEntitlementCached = cache(async () => {
  const { entitlement } =
    await resolveListingEntitlementContextForServerPage();
  return entitlement;
});

/**
 * Request-scoped listing load shared by generateMetadata + page.
 * Normalize MLS before cache() so case/whitespace variants hit one entry.
 * G.10C1: web force-enable + same entitlement snapshot for both callers.
 */
const loadListingByMlsCached = cache(async (mlsNumber: string) => {
  const entitlement = await resolveListingDetailEntitlementCached();
  return loadListingForDetailPage(mlsNumber, {
    entitlement,
    entitlementFilteringEnabled: true,
  });
});

function loadListingByMls(mlsNumber: string) {
  return loadListingByMlsCached(mlsNumber.trim().toUpperCase());
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { parts } = await params;
  const { mlsNumber, slug } = parseListingParts(parts);
  const listing = await loadListingByMls(mlsNumber);
  // Denied / missing → generic metadata only (no address/price/MLS/OG leak).
  if (!listing) return { title: "Listing" };

  // Legacy MLS-only URL — metadata still points at the canonical SEO URL.
  void slug;

  const cover =
    listing.media.find((media) => media.isPrimary) ?? listing.media[0] ?? null;
  const title = listingPageTitle(listing);
  const description = listing.description.slice(0, 160);
  const canonicalPath = listingPath(listing);
  const tenancy = await resolveMarketingTenancy();
  if (!tenancy) {
    return { title: { absolute: title }, description };
  }
  const canonicalOrigin = await resolveCanonicalPublicOrigin(
    tenancy.workspaceId,
    tenancy.hostname,
    tenancy.origin.startsWith("http://") ? "http:" : "https:",
  );
  const url =
    absoluteUrlForOrigin(canonicalOrigin, canonicalPath) ??
    absoluteUrlForOrigin(tenancy.origin, canonicalPath);
  const images = cover?.url
    ? [
        {
          url: cover.url,
          width: 1200,
          height: 630,
          alt: title,
        },
      ]
    : [];

  const pageMeta = buildTenantPublicPageMetadata({
    tenancy,
    canonicalOrigin,
    title,
    description,
    path: canonicalPath,
  });

  return {
    ...pageMeta,
    title: { absolute: title },
    openGraph: {
      ...pageMeta.openGraph,
      url: url ?? undefined,
      images,
    },
    twitter: {
      ...pageMeta.twitter,
      images: cover?.url ? [cover.url] : [],
    },
  };
}

export default async function ListingDetailPage({
  params,
  searchParams,
}: Params & { searchParams: Promise<{ sheet?: string | string[] }> }) {
  const { parts } = await params;
  const sp = await searchParams;
  const sheetParam = sp.sheet;
  const isListingSheet =
    sheetParam === "1" ||
    (Array.isArray(sheetParam) && sheetParam.includes("1"));
  const { mlsNumber, slug } = parseListingParts(parts);
  const listing = await loadListingByMls(mlsNumber);
  if (!listing) notFound();

  const canonicalPath = listingPath(listing);
  const expectedSlug = listingAddressSlug(listing) || "listing";

  // Legacy `/listing/MLS` or stale slug → permanent redirect to canonical.
  if (slug == null || slug !== expectedSlug) {
    permanentRedirect(canonicalPath);
  }

  const tenancy = await resolveMarketingTenancy();
  const canonicalOrigin = tenancy
    ? await resolveCanonicalPublicOrigin(
        tenancy.workspaceId,
        tenancy.hostname,
        tenancy.origin.startsWith("http://") ? "http:" : "https:",
      )
    : process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "http://127.0.0.1:3000";
  const siteName = tenancy?.brand.displayName ?? "Houzzat";
  const absoluteListingUrl = (path: string) =>
    absoluteUrlForOrigin(canonicalOrigin, path) ??
    `${canonicalOrigin.replace(/\/$/, "")}${path}`;

  const session = await auth();
  // Access fields only on SSR — save/watch/note/phone/prefs load after paint.
  const user = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        select: {
          id: true,
          emailVerified: true,
          createdAt: true,
        },
      })
    : null;
  const sessionContact = user
    ? {
        name: session?.user?.name ?? null,
        email: session?.user?.email ?? null,
        phone: null as string | null,
      }
    : undefined;

  // Board entitlement already applied in loadListingByMls (G.10C1).
  // VOW/session access is a second layer — never substitutes for board rights.
  const panelAccess = resolveListingDetailAccess(user, listing);
  if (panelAccess.vowBlocked) {
    if (needsEmailVerification(user)) {
      redirect(
        `/auth/verify-email?callbackUrl=${encodeURIComponent(canonicalPath)}`,
      );
    }
    redirect(
      `/auth/sign-in?callbackUrl=${encodeURIComponent(canonicalPath)}`,
    );
  }

  const verifyLocked = panelAccess.needsEmailVerification;
  const gateDetails = panelAccess.gateDetails;
  const gateSold = panelAccess.gateSold;
  const canSeeRestricted = panelAccess.canSeeRestricted;
  const detailsLocked = panelAccess.detailsLocked;
  const { listing: listingForClient, listingHistoryRows } =
    serializeListingDetailClientModel(listing, canSeeRestricted);

  // Neon-only SSR gallery (≤5). Never await PropTx here.
  // Vercel: do not invoke fetchListingPhotosFromPropTx — client enriches after
  // paint via GET /api/listings/:mls/gallery.
  // Cloudflare: start the fetch in parallel and pass the thenable.
  const galleryPhotos = resolveListingGalleryPhotos(listing);
  const clientLivePhotosPromise = process.env.VERCEL
    ? null
    : listing.dataSource === "mls" && listing.listingKey
      ? fetchListingPhotosFromPropTx(listing.listingKey, {
          timeoutMs: 10_000,
        }).then((photos) => {
          if (photos.length > 0) {
            scheduleWorkerSideEffect(
              persistNeonListingMediaCap(
                listing.id,
                photos.slice(0, NEON_LISTING_MEDIA_CAP).map((photo) => ({
                  url: photo.mediaUrl,
                  sortOrder: photo.sortOrder,
                  isPrimary: photo.isPrimary,
                })),
              ),
            );
          }
          return photos.map((photo) => ({
            id: photo.id,
            url: photo.url,
          }));
        })
      : null;

  scheduleWorkerSideEffect(
    prisma.listingView.create({
      data: { userId: user?.id, mlsNumber: listing.mlsNumber },
    }),
  );

  const addressLabel = formatListingAddressOneLine(listing);
  const coverUrl =
    listing.media.find((m) => m.isPrimary)?.url ?? listing.media[0]?.url ?? null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: addressLabel,
    url: absoluteListingUrl(canonicalPath),
    description: listing.description.slice(0, 300),
    datePosted: listing.listedAt.toISOString(),
    ...(coverUrl ? { image: [coverUrl] } : {}),
    offers: {
      "@type": "Offer",
      price: listing.listPrice,
      priceCurrency: "CAD",
      availability:
        listing.status === "ACTIVE"
          ? "https://schema.org/InStock"
          : "https://schema.org/SoldOut",
    },
    address: {
      "@type": "PostalAddress",
      streetAddress: listing.addressLine,
      addressLocality: listing.city,
      addressRegion: listing.province,
      postalCode: listing.postalCode,
      addressCountry: "CA",
    },
    ...(Number.isFinite(listing.lat) && Number.isFinite(listing.lng)
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: listing.lat,
            longitude: listing.lng,
          },
        }
      : {}),
    numberOfRooms: listing.beds,
    numberOfBedrooms: listing.beds,
    numberOfBathroomsTotal: listing.baths,
    floorSize: listing.sqft
      ? { "@type": "QuantitativeValue", value: listing.sqft, unitCode: "FTK" }
      : undefined,
    provider: {
      "@type": "RealEstateAgent",
      name: siteName,
      url: absoluteListingUrl("/"),
    },
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: absoluteListingUrl("/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: listing.city,
        item: absoluteListingUrl(homesForSaleCityPath(listing.city)),
      },
      ...(listing.community
        ? [
            {
              "@type": "ListItem" as const,
              position: 3,
              name: listing.community,
              item: absoluteListingUrl(
                homesForSaleCommunityPath(
                  listing.city,
                  listing.community,
                ),
              ),
            },
            {
              "@type": "ListItem" as const,
              position: 4,
              name: addressLabel,
              item: absoluteListingUrl(canonicalPath),
            },
          ]
        : [
            {
              "@type": "ListItem" as const,
              position: 3,
              name: addressLabel,
              item: absoluteListingUrl(canonicalPath),
            },
          ]),
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <ListingDetailView
        listing={listingForClient}
        galleryPhotos={galleryPhotos}
        livePhotosPromise={
          verifyLocked ? null : clientLivePhotosPromise
        }
        listingHistoryRows={listingHistoryRows}
        isListingSheet={isListingSheet}
        signedIn={Boolean(user)}
        sessionContact={sessionContact}
        canSeeRestricted={canSeeRestricted}
        detailsLocked={detailsLocked}
        verifyLocked={verifyLocked}
        gateDetails={gateDetails}
        gateSold={gateSold}
        canonicalPath={canonicalPath}
        expertWhatsApp={await resolveMarketingWhatsAppNumber()}
      />
    </>
  );
}
