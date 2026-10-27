"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ListingPhoto } from "@/components/listings/ListingPhoto";
import { ListingLink } from "@/components/listings/ListingLink";
import { citiesQueryParam } from "@/lib/geo/regions";
import {
  formatListingAddress,
  formatListingBedsLabel,
  formatListPrice,
  isClosedListingStatus,
  listingStatusLabel,
} from "@/lib/listings/constants";
import { listingPath } from "@/lib/listings/listing-path";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import { scheduleAfterFirstPaint } from "@/lib/mobile/schedule-idle";
import { ROYAL_COLLECTION_ONE_TEMPLATE_ID } from "@/lib/tenancy/templates/types";
import { RoyalCollectionPreviewLink } from "./RoyalCollectionPreviewLink";
import { RoyalCollectionReveal } from "./RoyalCollectionReveal";
import { takeRoyalFeaturedListings } from "./royal-featured-listings";
import { HIGH_OCTANE_DEMO_CARD_LABEL } from "@/lib/tenancy/templates/high-octane-public-showcase";
import { HIGH_OCTANE_DEVELOPMENT_LISTING_SOURCE } from "@/lib/tenancy/templates/high-octane-development-listings";
import styles from "./royal-collection.module.css";

/**
 * Concept cards for the HIGH OCTANE design preview.
 * Slots keep the approved card hierarchy. They are not listings:
 * no street, no asking price, no availability, and no board id.
 */
const SAMPLE_CARDS = [
  {
    place: "Niagara Falls",
    imageUrl: "/images/agent-signature-sell-architecture.jpg",
    focus: "center",
  },
  {
    place: "Niagara-on-the-Lake",
    imageUrl: "/images/home-preview/hero-luxury-residence.jpg",
    focus: "right",
  },
  {
    place: "St. Catharines",
    imageUrl: "/images/home-preview/hero-luxury-home.jpg",
    focus: "right",
  },
] as const;

async function fetchNewListings(params: URLSearchParams, signal: AbortSignal) {
  const res = await fetch(`/api/listings/home-rails?${params.toString()}`, {
    signal,
    credentials: "same-origin",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { newListings?: ListingCardData[] };
  return Array.isArray(data.newListings) ? data.newListings : [];
}

export function RoyalCollectionFeatured({
  cities,
  actionsDisabled = false,
  preserveEmpty = false,
}: {
  cities: string[];
  actionsDisabled?: boolean;
  preserveEmpty?: boolean;
}) {
  const [items, setItems] = useState<ListingCardData[] | null>(
    actionsDisabled ? [] : null,
  );

  useEffect(() => {
    if (actionsDisabled) return;
    let cancelled = false;
    const controller = new AbortController();
    async function load() {
      try {
        const citiesParam = citiesQueryParam(cities);
        const newest = await fetchNewListings(
          new URLSearchParams({ cities: citiesParam, limit: "6" }),
          controller.signal,
        );
        if (cancelled) return;
        setItems(takeRoyalFeaturedListings(newest));
      } catch {
        if (!cancelled) setItems([]);
      }
    }
    const cancelSchedule = scheduleAfterFirstPaint(() => {
      if (!cancelled) void load();
    }, { timeoutMs: 900 });
    return () => {
      cancelled = true;
      cancelSchedule();
      controller.abort();
    };
  }, [actionsDisabled, cities]);

  const showSamples = actionsDisabled;
  if (!showSamples && items != null && items.length === 0 && !preserveEmpty) return null;

  return (
    <section className={`${styles.section} ${styles.collection}`} aria-labelledby="rc-featured-heading">
      <RoyalCollectionReveal>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.sectionMeta}>Selected homes</div>
            <h2 id="rc-featured-heading">Featured Listings</h2>
          </div>
          <RoyalCollectionPreviewLink
            href="/search"
            className={styles.textLink}
            disabled={actionsDisabled}
          >
            View All Listings <span>↗</span>
          </RoyalCollectionPreviewLink>
        </div>
        <p className={styles.sectionLead}>
          {showSamples
            ? "Concept previews only. These cards are not listings, and the photographs are not properties for sale."
            : items != null && items.length === 0
              ? "Listings will appear here when this practice has its own listing source."
              : "Homes selected for this practice."}
        </p>
        {showSamples || items == null || items.length > 0 ? (
        <div className={styles.featureGrid}>
          {showSamples
            ? SAMPLE_CARDS.map((card) => (
                <Link
                  key={card.place}
                  href={`/listing/concept?previewTemplate=${ROYAL_COLLECTION_ONE_TEMPLATE_ID}`}
                  className={styles.featureLink}
                  data-rc-allow=""
                >
                <article className={styles.featureCard}>
                  <LuxuryCardFace
                    badge="Concept"
                    imageUrl={
                      process.env.NODE_ENV === "production" ? null : card.imageUrl
                    }
                    imageAlt="Concept preview photograph"
                    imageFocus={card.focus}
                    meta={["— Beds", "— Baths", "— Ft²"]}
                    city={card.place}
                    price="Concept"
                    address="Not an MLS listing"
                  />
                </article>
                </Link>
              ))
            : null}
          {showSamples
            ? null
            : (items ?? [null, null, null]).map((listing, index) =>
                listing ? (
                  <LiveFeaturedCard key={listing.mlsNumber} listing={listing} />
                ) : (
                  <article key={`placeholder-${index}`} className={styles.featureCard} aria-hidden>
                    <div className={styles.featureMedia} />
                    <div className={styles.featureBody}>
                      <p className={styles.muted}>Loading listings</p>
                    </div>
                  </article>
                ),
              )}
        </div>
        ) : (
          <div className={styles.featureEmpty}>
            <p>No listings are published on this site yet.</p>
          </div>
        )}
      </RoyalCollectionReveal>
    </section>
  );
}

function LiveFeaturedCard({ listing }: { listing: ListingCardData }) {
  const sqft = formatArea(listing.sqft, listing.livingAreaRange);
  const meta = [
    `${formatListingBedsLabel(listing)} Beds`,
    `${formatCount(listing.baths)} Baths`,
    sqft,
  ].filter((part): part is string => Boolean(part));
  const face = (
    <LuxuryCardFace
      badge={
        listing.dataSource === HIGH_OCTANE_DEVELOPMENT_LISTING_SOURCE
          ? HIGH_OCTANE_DEMO_CARD_LABEL
          : listingStatusLabel(listing.status, listing.transactionType)
      }
      imageUrl={listing.primaryImageUrl}
      imageAlt={listing.addressLine}
      meta={meta}
      city={listing.city}
      price={formatListPrice(
        isClosedListingStatus(listing.status) && listing.soldPrice != null
          ? listing.soldPrice
          : listing.listPrice,
        listing.transactionType,
      )}
      address={formatListingAddress(listing)[0]}
    />
  );
  return (
    <article className={styles.featureCard}>
      <ListingLink href={listingPath(listing)} className={styles.featureLink}>
        {face}
      </ListingLink>
    </article>
  );
}

function LuxuryCardFace({
  badge,
  imageUrl,
  imageAlt,
  imageFocus,
  meta,
  city,
  price,
  address,
}: {
  badge: string;
  imageUrl: string | null;
  imageAlt: string;
  imageFocus?: "center" | "right";
  meta: string[];
  city: string;
  price: string;
  address: string;
}) {
  return (
    <>
      <div className={styles.featureMedia}>
        {imageUrl ? (
          imageUrl.startsWith("/") ? (
            // Local marketing stills. next/image's optimizer can return an
            // undecodable body for these files on this volume.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={imageAlt}
              className={
                imageFocus === "right" ? styles.featureImageRight : styles.featureImage
              }
            />
          ) : (
            <ListingPhoto
              src={imageUrl}
              alt={imageAlt}
              fill
              className={
                imageFocus === "right" ? styles.featureImageRight : styles.featureImage
              }
              sizes="(max-width: 800px) 100vw, 33vw"
            />
          )
        ) : null}
        <span className={styles.featureBadge}>{badge}</span>
      </div>
      <div className={styles.featureBody}>
        <p className={styles.featureMeta}>
          {meta.map((part) => (
            <span key={part}>{part}</span>
          ))}
        </p>
        <p className={styles.featureCity}>{city}</p>
        <p className={styles.featurePrice}>{price}</p>
        <p className={styles.featureAddress}>{address}</p>
      </div>
    </>
  );
}

function formatCount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatArea(sqft: number | null, range?: string | null) {
  if (sqft != null && sqft > 0) {
    return `${Math.round(sqft).toLocaleString("en-CA")} Ft²`;
  }
  const text = range?.trim();
  return text ? `${text} Ft²` : null;
}
