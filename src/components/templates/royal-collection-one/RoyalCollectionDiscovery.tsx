"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ListingPhoto } from "@/components/listings/ListingPhoto";
import { ListingLink } from "@/components/listings/ListingLink";
import { citiesQueryParam } from "@/lib/geo/regions";
import { homeRailsClientFetchInit } from "@/lib/listings/home-rails-access";
import {
  formatListingAddress,
  formatListingBedsLabel,
  formatListPrice,
  isClosedListingStatus,
  listingStatusLabel,
} from "@/lib/listings/constants";
import { listingPath } from "@/lib/listings/listing-path";
import { buildListingsQuery } from "@/lib/listings/search-state/query";
import { parseSearchUrl } from "@/lib/listings/search-state/parse";
import type { ListingCard } from "@/lib/listings/types";
import { localRecentMlsNumbers } from "@/lib/recent-views-local";
import { scheduleAfterFirstPaint } from "@/lib/mobile/schedule-idle";
import { HIGH_OCTANE_DEMO_CARD_LABEL } from "@/lib/tenancy/templates/high-octane-public-showcase";
import { useHomepageSearchSource } from "@/components/home/use-homepage-search-source";
import { RoyalCollectionPreviewLink } from "./RoyalCollectionPreviewLink";
import {
  authorizedLeaseListings,
  authorizedSoldListings,
  isDemonstrationListing,
  listingsAfterFeatured,
  recommendationListings,
  upcomingOpenHouseListings,
} from "./royal-discovery-listings";
import styles from "./royal-collection.module.css";

type RailsPayload = {
  newListings?: ListingCard[];
  openHouses?: ListingCard[];
  sold?: ListingCard[];
  forLease?: ListingCard[];
};

const RAIL_LIMIT = 18;

function searchHref(cities: string[], extra: Record<string, string>): string {
  const params = new URLSearchParams({
    cities: citiesQueryParam(cities),
    ...extra,
  });
  return `/search?${params.toString()}`;
}

function cardPrice(listing: ListingCard): string {
  if (isClosedListingStatus(listing.status)) {
    if (listing.soldPrice == null) return "Sold";
    return formatListPrice(listing.soldPrice, listing.transactionType);
  }
  return formatListPrice(listing.listPrice, listing.transactionType);
}

function DiscoveryCard({ listing }: { listing: ListingCard }) {
  const sqft =
    listing.sqft != null && listing.sqft > 0
      ? `${Math.round(listing.sqft).toLocaleString("en-CA")} Ft²`
      : null;
  const meta = [
    `${formatListingBedsLabel(listing)} Beds`,
    `${Number.isInteger(listing.baths) ? listing.baths : listing.baths.toFixed(1)} Baths`,
    sqft,
  ].filter((part): part is string => Boolean(part));
  return (
    <article className={styles.featureCard}>
      <ListingLink href={listingPath(listing)} className={styles.featureLink}>
        <div className={styles.featureMedia}>
          {listing.primaryImageUrl ? (
            <ListingPhoto
              src={listing.primaryImageUrl}
              alt=""
              fill
              className={styles.featureImage}
              sizes="(max-width: 767px) 82vw, 320px"
            />
          ) : null}
          <span className={styles.featureBadge}>
            {isDemonstrationListing(listing)
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
          <p className={styles.featurePrice}>{cardPrice(listing)}</p>
          <p className={styles.featureAddress}>{formatListingAddress(listing)[0]}</p>
        </div>
      </ListingLink>
    </article>
  );
}

function DiscoveryRail({
  id,
  eyebrow,
  title,
  href,
  items,
}: {
  id: string;
  eyebrow: string;
  title: string;
  href: string;
  items: ListingCard[];
}) {
  const scroller = useRef<HTMLUListElement>(null);
  if (items.length === 0) return null;
  const titleId = `${id}-title`;

  function move(direction: number) {
    const node = scroller.current;
    if (!node) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollBy({
      left: direction * Math.max(node.clientWidth * 0.86, 220),
      behavior: reduce ? "auto" : "smooth",
    });
  }

  return (
    <section
      className={`${styles.section} ${styles.discoverySection}`}
      aria-labelledby={titleId}
    >
      <div className={styles.sectionHead}>
        <div>
          <div className={styles.sectionMeta}>{eyebrow}</div>
          <h2 id={titleId}>{title}</h2>
        </div>
        <div className={styles.discoveryActions}>
          <div className={styles.railControls}>
            <button type="button" aria-label={`Previous ${title}`} onClick={() => move(-1)}>
              ‹
            </button>
            <button type="button" aria-label={`Next ${title}`} onClick={() => move(1)}>
              ›
            </button>
          </div>
          <RoyalCollectionPreviewLink href={href} className={styles.textLink} disabled={false}>
            View all <span>↗</span>
          </RoyalCollectionPreviewLink>
        </div>
      </div>
      <ul ref={scroller} className={styles.discoveryRail}>
        {items.map((listing) => (
          <li key={listing.mlsNumber}>
            <DiscoveryCard listing={listing} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Royal Collection discovery rails.
 * Data comes from the existing home-rails, search, recently-viewed, and
 * homepage-personalization paths. Empty and unauthorized rails stay hidden.
 */
export function RoyalCollectionDiscovery({
  cities,
  actionsDisabled = false,
}: {
  cities: string[];
  actionsDisabled?: boolean;
}) {
  const { data: session, status } = useSession();
  const { source, ready: sourceReady } = useHomepageSearchSource();
  const [rails, setRails] = useState<RailsPayload | null>(null);
  const [recent, setRecent] = useState<ListingCard[] | null>(null);
  const [recommended, setRecommended] = useState<ListingCard[] | null>(null);
  const signedIn = status === "authenticated" && Boolean(session?.user);

  useEffect(() => {
    if (actionsDisabled) return;
    let cancelled = false;
    const controller = new AbortController();
    async function load() {
      try {
        const params = new URLSearchParams({
          cities: citiesQueryParam(cities),
          limit: String(RAIL_LIMIT),
        });
        const res = await fetch(
          `/api/listings/home-rails?${params.toString()}`,
          { ...homeRailsClientFetchInit(signedIn), signal: controller.signal },
        );
        if (!res.ok) throw new Error("home-rails");
        const data = (await res.json()) as RailsPayload;
        if (!cancelled) setRails(data);
      } catch {
        if (!cancelled) setRails({});
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
  }, [actionsDisabled, cities, signedIn]);

  useEffect(() => {
    if (actionsDisabled || status === "loading") return;
    let cancelled = false;
    const controller = new AbortController();

    async function loadAuthenticated() {
      const res = await fetch("/api/account/home-shell", {
        signal: controller.signal,
        credentials: "same-origin",
      });
      if (!res.ok) return [];
      const body = (await res.json()) as { recentlyViewed?: ListingCard[] };
      return Array.isArray(body.recentlyViewed) ? body.recentlyViewed : [];
    }

    async function loadLocal() {
      const ids = localRecentMlsNumbers(8);
      if (ids.length === 0) return [];
      const res = await fetch(
        `/api/listings/by-mls?ids=${encodeURIComponent(ids.join(","))}`,
        { signal: controller.signal, credentials: "same-origin" },
      );
      if (!res.ok) return [];
      const body = (await res.json()) as { items?: ListingCard[] };
      return Array.isArray(body.items) ? body.items : [];
    }

    async function load() {
      try {
        const items = signedIn ? await loadAuthenticated() : await loadLocal();
        if (!cancelled) setRecent(items);
      } catch {
        if (!cancelled) setRecent([]);
      }
    }

    const cancelSchedule = scheduleAfterFirstPaint(() => {
      if (!cancelled) void load();
    }, { timeoutMs: 1100 });
    return () => {
      cancelled = true;
      cancelSchedule();
      controller.abort();
    };
  }, [actionsDisabled, signedIn, status]);

  useEffect(() => {
    if (actionsDisabled || !sourceReady || source?.kind !== "primary") return;
    let cancelled = false;
    const controller = new AbortController();
    const href = source.href;
    async function load() {
      try {
        const committed = parseSearchUrl(href);
        const params = new URLSearchParams(
          buildListingsQuery({ ...committed, view: "cards" }),
        );
        params.set("limit", "12");
        if (!params.get("status") && !params.get("statuses")) {
          params.set("status", "ACTIVE");
        }
        const res = await fetch(`/api/listings/search?${params.toString()}`, {
          signal: controller.signal,
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error("search");
        const body = (await res.json()) as { items?: ListingCard[] };
        if (!cancelled) {
          setRecommended(Array.isArray(body.items) ? body.items : []);
        }
      } catch {
        if (!cancelled) setRecommended([]);
      }
    }
    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [actionsDisabled, source, sourceReady]);

  if (actionsDisabled || rails == null) return null;

  const newest = rails.newListings ?? [];
  const fresh = listingsAfterFeatured(newest);
  const featuredMls = new Set(
    newest.filter((item) => !fresh.some((next) => next.mlsNumber === item.mlsNumber)).map(
      (item) => item.mlsNumber,
    ),
  );
  const openHouses = upcomingOpenHouseListings(rails.openHouses ?? []);
  const sold = authorizedSoldListings(rails.sold ?? []);
  const leases = authorizedLeaseListings(rails.forLease ?? []);
  const shown = new Set([
    ...featuredMls,
    ...fresh.map((item) => item.mlsNumber),
  ]);
  const recommendedItems = recommendationListings(
    source?.kind === "primary" ? (recommended ?? []) : [],
    shown,
  );
  const recentItems = recent ?? [];

  return (
    <div className={styles.discovery}>
      <DiscoveryRail
        id="rc-new-listings"
        eyebrow="Just listed"
        title="New Listings"
        href={searchHref(cities, {
          transactionType: "SALE",
          segment: "RESIDENTIAL",
          sort: "newest",
        })}
        items={fresh}
      />
      <DiscoveryRail
        id="rc-open-houses"
        eyebrow="This week"
        title="Open Houses"
        href={searchHref(cities, { transactionType: "SALE", openHouseOnly: "1" })}
        items={openHouses}
      />
      <DiscoveryRail
        id="rc-recently-sold"
        eyebrow="Recorded sales"
        title="Recently Sold"
        href={searchHref(cities, { status: "SOLD", sort: "newest" })}
        items={sold}
      />
      <DiscoveryRail
        id="rc-for-lease"
        eyebrow="For lease"
        title="Homes for Lease"
        href={searchHref(cities, { transactionType: "LEASE", sort: "newest" })}
        items={leases}
      />
      <DiscoveryRail
        id="rc-recommended"
        eyebrow="For you"
        title="Recommended for You"
        href={source?.kind === "primary" ? source.href : "/search"}
        items={recommendedItems}
      />
      <DiscoveryRail
        id="rc-recently-viewed"
        eyebrow="Your visits"
        title="Recently Viewed"
        href={signedIn ? "/account" : "/search"}
        items={recentItems}
      />
    </div>
  );
}
