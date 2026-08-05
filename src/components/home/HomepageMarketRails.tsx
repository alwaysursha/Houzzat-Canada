"use client";

import { useEffect, useRef, useState } from "react";
import { HomeListingRail } from "@/components/home/HomeListingRail";
import { HomeOpenHousesRail } from "@/components/home/HomeOpenHousesRail";
import { HomeSoldRail } from "@/components/home/HomeSoldRail";
import {
  citiesQueryParam,
  resolveRegionFromCity,
  resolveRegionFromCoords,
  type MarketRegion,
} from "@/lib/geo/regions";
import type { HomepagePersonalizationQuery } from "@/lib/listings/homepage-personalization";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";

const GEO_REGION_KEY = "houzzat-region-geo";
const RAIL_LIMIT = 12;

type HomeRailsPayload = {
  newListings?: ListingCardData[];
  openHouses?: ListingCardData[];
  sold?: ListingCardData[];
  forLease?: ListingCardData[];
  commercial?: ListingCardData[];
};

function personalizationQuery(
  personalization: HomepagePersonalizationQuery | null,
): Record<string, string | undefined> {
  if (!personalization) return {};
  return {
    minPrice: personalization.minPrice,
    maxPrice: personalization.maxPrice,
    propertyTypes: personalization.propertyTypes?.join(","),
    communities: personalization.communities?.length
      ? personalization.communities.join("|")
      : undefined,
  };
}

function homeRailsUrl(
  cities: string,
  extras: Record<string, string | undefined>,
) {
  const q = new URLSearchParams({
    cities,
    limit: String(RAIL_LIMIT),
  });
  for (const [key, value] of Object.entries(extras)) {
    if (value) q.set(key, value);
  }
  return `/api/listings/home-rails?${q.toString()}`;
}

export function HomepageMarketRails({
  isClient,
  needsEmailVerification = false,
  vowOnlyGuest,
  personalization,
}: {
  isClient: boolean;
  needsEmailVerification?: boolean;
  vowOnlyGuest: boolean;
  personalization: HomepagePersonalizationQuery | null;
}) {
  const [region, setRegion] = useState<MarketRegion>(() =>
    resolveRegionFromCity(personalization?.city ?? null).region,
  );
  const [ready, setReady] = useState(false);
  const [newListings, setNewListings] = useState<ListingCardData[]>([]);
  const [openHouses, setOpenHouses] = useState<ListingCardData[]>([]);
  const [sold, setSold] = useState<ListingCardData[]>([]);
  const [forLease, setForLease] = useState<ListingCardData[]>([]);
  const [commercial, setCommercial] = useState<ListingCardData[]>([]);
  const regionIdRef = useRef(region.id);
  regionIdRef.current = region.id;

  useEffect(() => {
    let cancelled = false;

    async function resolveBrowseRegion(): Promise<MarketRegion> {
      if (personalization?.city) {
        return resolveRegionFromCity(personalization.city).region;
      }

      if (typeof navigator === "undefined" || !navigator.geolocation) {
        return resolveRegionFromCity(null).region;
      }

      try {
        const cached =
          typeof sessionStorage !== "undefined"
            ? sessionStorage.getItem(GEO_REGION_KEY)
            : null;
        if (cached) {
          const parsed = JSON.parse(cached) as { lat: number; lng: number };
          if (Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng)) {
            return resolveRegionFromCoords(parsed.lat, parsed.lng).region;
          }
        }
      } catch {
        // ignore cache parse
      }

      return resolveRegionFromCity(null).region;
    }

    async function loadForRegion(nextRegion: MarketRegion) {
      if (cancelled) return;
      setRegion(nextRegion);

      const cities = citiesQueryParam(nextRegion.cities);
      const extras = personalizationQuery(personalization);

      try {
        const res = await fetch(homeRailsUrl(cities, extras), {
          cache: "default",
        });
        if (!res.ok) throw new Error(`home-rails ${res.status}`);
        const data = (await res.json()) as HomeRailsPayload;
        if (cancelled) return;

        // Paint rails as soon as the batch arrives (one round-trip).
        setNewListings(data.newListings ?? []);
        setOpenHouses(data.openHouses ?? []);
        setSold(data.sold ?? []);
        setForLease(data.forLease ?? []);
        setCommercial(data.commercial ?? []);
        setReady(true);
      } catch {
        if (cancelled) return;
        setNewListings([]);
        setOpenHouses([]);
        setSold([]);
        setForLease([]);
        setCommercial([]);
        setReady(true);
      }
    }

    async function load() {
      if (vowOnlyGuest) {
        if (!cancelled) {
          setReady(true);
          setNewListings([]);
          setOpenHouses([]);
          setSold([]);
          setForLease([]);
          setCommercial([]);
        }
        return;
      }

      const nextRegion = await resolveBrowseRegion();
      await loadForRegion(nextRegion);

      if (personalization?.city || cancelled) return;
      if (typeof navigator === "undefined" || !navigator.geolocation) return;
      try {
        const permission = navigator.permissions?.query
          ? (await navigator.permissions.query({ name: "geolocation" })).state
          : "unknown";
        if (permission === "denied") return;
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (cancelled) return;
            const { latitude: lat, longitude: lng } = position.coords;
            try {
              sessionStorage.setItem(
                GEO_REGION_KEY,
                JSON.stringify({ lat, lng }),
              );
            } catch {
              // ignore
            }
            const upgraded = resolveRegionFromCoords(lat, lng).region;
            if (upgraded.id === nextRegion.id) return;
            void loadForRegion(upgraded);
          },
          () => undefined,
          {
            enableHighAccuracy: false,
            timeout: 8000,
            maximumAge: 300_000,
          },
        );
      } catch {
        // ignore geo upgrade failures
      }
    }

    function onGeo(event: Event) {
      if (vowOnlyGuest || personalization?.city || cancelled) return;
      const detail = (event as CustomEvent<{ lat: number; lng: number }>).detail;
      if (
        !detail ||
        !Number.isFinite(detail.lat) ||
        !Number.isFinite(detail.lng)
      ) {
        return;
      }
      const next = resolveRegionFromCoords(detail.lat, detail.lng).region;
      if (next.id === regionIdRef.current) return;
      void loadForRegion(next);
    }

    window.addEventListener("houzzat:geo", onGeo);
    void load();
    return () => {
      cancelled = true;
      window.removeEventListener("houzzat:geo", onGeo);
    };
  }, [isClient, personalization, vowOnlyGuest]);

  const citiesParam = citiesQueryParam(region.cities);

  const seeAll = (extra: Record<string, string>) => {
    const q = new URLSearchParams({ cities: citiesParam, ...extra });
    if (personalization?.minPrice) q.set("minPrice", personalization.minPrice);
    if (personalization?.maxPrice) q.set("maxPrice", personalization.maxPrice);
    if (personalization?.propertyTypes?.length) {
      q.set("propertyTypes", personalization.propertyTypes.join(","));
    }
    return `/search?${q.toString()}`;
  };

  if (vowOnlyGuest) {
    return null;
  }

  return (
    <div className="space-y-10 sm:space-y-16">
      <HomeListingRail
        id="rail-new-listings"
        title="New Listings"
        href={seeAll({
          transactionType: "SALE",
          segment: "RESIDENTIAL",
          sort: "newest",
        })}
        items={newListings}
        emptyLabel={
          ready
            ? "No new listings in this area right now."
            : "Loading new listings…"
        }
      />

      <HomeOpenHousesRail
        items={openHouses}
        href={seeAll({
          transactionType: "SALE",
          openHouseOnly: "1",
        })}
        emptyLabel={ready ? undefined : "Loading open houses…"}
      />

      <HomeSoldRail
        items={sold}
        isClient={isClient}
        needsEmailVerification={needsEmailVerification}
        seeAllHref={seeAll({ status: "SOLD", sort: "newest" })}
        emptyLabel={
          ready
            ? "No recently sold homes in this area right now."
            : "Loading recently sold…"
        }
      />

      <HomeListingRail
        id="rail-for-lease"
        title="For lease"
        href={seeAll({ transactionType: "LEASE", sort: "newest" })}
        items={forLease}
        emptyLabel={
          ready
            ? "No lease listings in this area right now."
            : "Loading lease listings…"
        }
      />

      <HomeListingRail
        id="rail-commercial"
        title="Commercial"
        href={seeAll({
          segment: "COMMERCIAL",
          transactionType: "SALE",
          sort: "newest",
        })}
        items={commercial}
        emptyLabel={
          ready
            ? "No commercial listings in this area right now."
            : "Loading commercial…"
        }
      />
    </div>
  );
}
