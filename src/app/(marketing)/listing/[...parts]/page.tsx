import { cache } from "react";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ListingDetailView } from "@/components/listings/ListingDetailView";
import { buildAddressListingHistoryRows } from "@/lib/listings/address-history";
import { resolveListingDetailAccess } from "@/lib/listings/build-listing-panel";
import { formatListingAddressOneLine } from "@/lib/listings/constants";
import { NEON_LISTING_MEDIA_CAP } from "@/lib/listings/gallery-constants";
import { loadListingForDetailPage } from "@/lib/listings/load-listing-for-detail";
import { persistNeonListingMediaCap } from "@/lib/listings/persist-neon-media";
import { resolveListingGalleryPhotos } from "@/lib/listings/resolve-gallery";
import { fetchListingPhotosFromPropTx } from "@/lib/proptx/listing-photos";
import { auth } from "@/lib/auth";
import { prisma, scheduleWorkerSideEffect } from "@/lib/prisma";
import { needsEmailVerification } from "@/lib/account-access";
import { SITE_NAME, SITE_URL } from "@/lib/constants";
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
 * Request-scoped listing load shared by generateMetadata + page.
 * Normalize MLS before cache() so case/whitespace variants hit one entry.
 */
const loadListingByMlsCached = cache((mlsNumber: string) =>
  loadListingForDetailPage(mlsNumber),
);

function loadListingByMls(mlsNumber: string) {
  return loadListingByMlsCached(mlsNumber.trim().toUpperCase());
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { parts } = await params;
  const { mlsNumber, slug } = parseListingParts(parts);
  const listing = await loadListingByMls(mlsNumber);
  if (!listing) return { title: "Listing" };

  // Legacy MLS-only URL — metadata still points at the canonical SEO URL.
  void slug;

  const cover =
    listing.media.find((media) => media.isPrimary) ?? listing.media[0] ?? null;
  const title = listingPageTitle(listing);
  const description = listing.description.slice(0, 160);
  const canonicalPath = listingPath(listing);
  const url = `${SITE_URL}${canonicalPath}`;
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

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_CA",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
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

  // Same access resolver as GET /api/listings/[mls]/panel (flags cannot drift).
  // RSC still redirects on VOW-only; the panel API returns 401/403 JSON instead.
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

  // Neon-only SSR gallery (≤5). Never await PropTx here — start it in parallel
  // and pass the promise to the client so enrich skips an extra API hop.
  const galleryPhotos = resolveListingGalleryPhotos(listing);
  const livePhotosPromise =
    listing.dataSource === "mls" && listing.listingKey
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

  // Address siblings enrich client-side (ListingHistoryPanel).
  // RSC keeps existing HTML behavior (soldPrice still in history builder);
  // panel API redacts soldPrice server-side for guests.
  const listingHistoryRows = buildAddressListingHistoryRows({
    mlsNumber: listing.mlsNumber,
    listPrice: listing.listPrice,
    listedAt: listing.listedAt,
    updatedAtMls: listing.updatedAtMls,
    soldAt: listing.soldAt,
    soldPrice: listing.soldPrice,
    status: listing.status,
    transactionType: listing.transactionType,
    history: listing.history,
    siblings: [],
  });

  const addressLabel = formatListingAddressOneLine(listing);

  const coverUrl =
    listing.media.find((m) => m.isPrimary)?.url ?? listing.media[0]?.url ?? null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: addressLabel,
    url: `${SITE_URL}${canonicalPath}`,
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
      name: SITE_NAME,
      url: SITE_URL,
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
        item: SITE_URL,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: listing.city,
        item: `${SITE_URL}${homesForSaleCityPath(listing.city)}`,
      },
      ...(listing.community
        ? [
            {
              "@type": "ListItem" as const,
              position: 3,
              name: listing.community,
              item: `${SITE_URL}${homesForSaleCommunityPath(
                listing.city,
                listing.community,
              )}`,
            },
            {
              "@type": "ListItem" as const,
              position: 4,
              name: addressLabel,
              item: `${SITE_URL}${canonicalPath}`,
            },
          ]
        : [
            {
              "@type": "ListItem" as const,
              position: 3,
              name: addressLabel,
              item: `${SITE_URL}${canonicalPath}`,
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
        listing={listing}
        galleryPhotos={galleryPhotos}
        livePhotosPromise={livePhotosPromise}
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
      />
    </>
  );
}
