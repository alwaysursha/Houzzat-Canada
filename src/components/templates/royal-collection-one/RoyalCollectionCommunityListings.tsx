"use client";

import { useEffect, useState } from "react";
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
import { HIGH_OCTANE_DEVELOPMENT_LISTING_SOURCE } from "@/lib/tenancy/templates/high-octane-development-listings";
import { HIGH_OCTANE_DEMO_CARD_LABEL } from "@/lib/tenancy/templates/high-octane-public-showcase";
import { RoyalCollectionPreviewLink } from "./RoyalCollectionPreviewLink";
import styles from "./royal-collection.module.css";

export function RoyalCollectionCommunityListings({
  city,
  placeName,
  searchHref,
  actionsDisabled,
}: {
  city: string;
  placeName: string;
  searchHref: string;
  actionsDisabled: boolean;
}) {
  const [items, setItems] = useState<ListingCardData[] | null>(actionsDisabled ? [] : null);

  useEffect(() => {
    if (actionsDisabled) return;
    let cancelled = false;
    const controller = new AbortController();
    async function load() {
      try {
        const params = new URLSearchParams({
          cities: citiesQueryParam([city]),
          limit: "48",
        });
        const res = await fetch(`/api/listings/home-rails?${params.toString()}`, {
          signal: controller.signal,
          credentials: "same-origin",
        });
        if (!res.ok) {
          if (!cancelled) setItems([]);
          return;
        }
        const data = (await res.json()) as { newListings?: ListingCardData[] };
        if (!cancelled) setItems(Array.isArray(data.newListings) ? data.newListings : []);
      } catch {
        if (!cancelled) setItems([]);
      }
    }
    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [actionsDisabled, city]);

  return (
    <section className={styles.guideListings} aria-labelledby="rc-community-listings">
      <div className={styles.guideListingsHead}>
        <div>
          <div className={styles.sectionMeta}>Available listings</div>
          <h2 id="rc-community-listings">Homes in {placeName}</h2>
        </div>
        <RoyalCollectionPreviewLink href={searchHref} className={styles.textLink} disabled={actionsDisabled}>
          Explore homes <span>↗</span>
        </RoyalCollectionPreviewLink>
      </div>
      {items == null ? (
        <div className={styles.featureGrid}>
          {[0, 1].map((index) => (
            <article key={index} className={styles.featureCard} aria-hidden>
              <div className={styles.featureMedia} />
              <div className={styles.featureBody}>
                <p className={styles.muted}>Loading listings</p>
              </div>
            </article>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className={styles.featureEmpty}>
          <p>No homes are published in {placeName} on this site yet.</p>
        </div>
      ) : (
        <div className={styles.featureGrid}>
          {items.map((listing) => (
            <article key={listing.mlsNumber} className={styles.featureCard}>
              <ListingLink href={listingPath(listing)} className={styles.featureLink}>
                <CommunityListingFace listing={listing} />
              </ListingLink>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function CommunityListingFace({ listing }: { listing: ListingCardData }) {
  const sqft =
    listing.sqft != null && listing.sqft > 0
      ? `${Math.round(listing.sqft).toLocaleString("en-CA")} Ft²`
      : null;
  const meta = [
    `${formatListingBedsLabel(listing)} Beds`,
    `${Number.isInteger(listing.baths) ? listing.baths : listing.baths.toFixed(1)} Baths`,
    sqft,
  ].filter((part): part is string => Boolean(part));
  const imageUrl = listing.primaryImageUrl;
  return (
    <>
      <div className={styles.featureMedia}>
        {imageUrl ? (
          imageUrl.startsWith("/") ? (
            // eslint-disable-next-line @next/next/no-img-element -- local listing still
            <img src={imageUrl} alt={listing.addressLine} className={styles.featureImage} />
          ) : (
            <ListingPhoto
              src={imageUrl}
              alt={listing.addressLine}
              fill
              className={styles.featureImage}
              sizes="(max-width: 800px) 100vw, 33vw"
            />
          )
        ) : null}
        <span className={styles.featureBadge}>
          {listing.dataSource === HIGH_OCTANE_DEVELOPMENT_LISTING_SOURCE
            ? HIGH_OCTANE_DEMO_CARD_LABEL
            : listingStatusLabel(listing.status, listing.transactionType)}
        </span>
      </div>
      <div className={styles.featureBody}>
        <p className={styles.featureMeta}>
          {meta.map((part) => (
            <span key={part}>{part}</span>
          ))}
        </p>
        <p className={styles.featureCity}>{listing.city}</p>
        <p className={styles.featurePrice}>
          {formatListPrice(
            isClosedListingStatus(listing.status) && listing.soldPrice != null
              ? listing.soldPrice
              : listing.listPrice,
            listing.transactionType,
          )}
        </p>
        <p className={styles.featureAddress}>{formatListingAddress(listing)[0]}</p>
      </div>
    </>
  );
}
