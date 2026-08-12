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
import {
  getCurrentCoordinates,
  readLocationPermissionState,
} from "@/lib/mobile/geolocation";

const GEO_REGION_KEY = "houzzat-region-geo";
const RAIL_LIMIT = 12;

type HomeRailsPayload = {
  newListings?: ListingCardData[];
  openHouses?: ListingCardData[];
  sold?: ListingCardData[];
  forLease?: ListingCardData[];
  commercial?: ListingCardData[];
};

function personalizationCities(
  personalization: HomepagePersonalizationQuery | null | undefined,
): string[] {
  if (!personalization) return [];
  if (personalization.cities?.length) return personalization.cities;
  if (personalization.city) return [personalization.city];
  return [];
}

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
    resolveRegionFromCity(personalizationCities(personalization)[0] ?? null)
      .region,
  );
  const [overrideCities, setOverrideCities] = useState<string[] | null>(() => {
    const cities = personalizationCities(personalization);
    return cities.length ? cities : null;
  });
  const loadedRef = useRef(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [newListings, setNewListings] = useState<ListingCardData[]>([]);
  const [openHouses, setOpenHouses] = useState<ListingCardData[]>([]);
  const [sold, setSold] = useState<ListingCardData[]>([]);
  const [forLease, setForLease] = useState<ListingCardData[]>([]);
  const [commercial, setCommercial] = useState<ListingCardData[]>([]);
  const regionIdRef = useRef(region.id);
  regionIdRef.current = region.id;

  const personalizedCities = personalizationCities(personalization);
  const personalizationKey = JSON.stringify({
    cities: personalizedCities,
    ...personalizationQuery(personalization),
  });

  useEffect(() => {
    let cancelled = false;
    let requestId = 0;

    async function resolveBrowseRegion(): Promise<MarketRegion> {
      const personalizedCities = personalizationCities(personalization);
      if (personalizedCities.length) {
        setOverrideCities(personalizedCities);
        return resolveRegionFromCity(personalizedCities[0] ?? null).region;
      }
      setOverrideCities(null);

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

    async function loadForRegion(
      nextRegion: MarketRegion,
      cityOverride?: string[] | null,
    ) {
      if (cancelled) return;
      const thisRequest = ++requestId;
      setRegion(nextRegion);

      const cities = citiesQueryParam(
        cityOverride?.length ? cityOverride : nextRegion.cities,
      );
      const extras = personalizationQuery(personalization);

      try {
        const res = await fetch(homeRailsUrl(cities, extras), {
          cache: "default",
        });
        if (!res.ok) throw new Error(`home-rails ${res.status}`);
        const data = (await res.json()) as HomeRailsPayload;
        if (cancelled || thisRequest !== requestId) return;
        setNewListings(data.newListings ?? []);
        setOpenHouses(data.openHouses ?? []);
        setSold(data.sold ?? []);
        setForLease(data.forLease ?? []);
        setCommercial(data.commercial ?? []);
        loadedRef.current = true;
        setHasLoaded(true);
      } catch {
        if (cancelled || thisRequest !== requestId) return;
        if (loadedRef.current) return;
        setNewListings([]);
        setOpenHouses([]);
        setSold([]);
        setForLease([]);
        setCommercial([]);
        setHasLoaded(true);
      }
    }

    async function load() {
      if (vowOnlyGuest) {
        if (!cancelled) {
          setHasLoaded(true);
        }
        return;
      }

      const nextRegion = await resolveBrowseRegion();
      const personalizedCities = personalizationCities(personalization);
      await loadForRegion(
        nextRegion,
        personalizedCities.length ? personalizedCities : null,
      );

      if (personalizedCities.length || cancelled) return;
      try {
        const permission = await readLocationPermissionState();
        if (permission === "denied") return;
        const { lat, lng } = await getCurrentCoordinates({
          enableHighAccuracy: false,
          timeout: 8_000,
          maximumAge: 300_000,
        });
        if (cancelled) return;
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
      } catch {
        // ignore geo upgrade failures
      }
    }

    function onGeo(event: Event) {
      if (
        vowOnlyGuest ||
        personalizationCities(personalization).length ||
        cancelled
      ) {
        return;
      }
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
  }, [personalizationKey, vowOnlyGuest]);

  const citiesParam = citiesQueryParam(
    overrideCities?.length ? overrideCities : region.cities,
  );

  const seeAll = (extra: Record<string, string>) => {
    const q = new URLSearchParams({ cities: citiesParam, ...extra });
    if (personalization?.minPrice) q.set("minPrice", personalization.minPrice);
    if (personalization?.maxPrice) q.set("maxPrice", personalization.maxPrice);
    if (personalization?.propertyTypes?.length) {
      q.set("propertyTypes", personalization.propertyTypes.join(","));
    }
    if (personalization?.communities?.length) {
      q.set("communities", personalization.communities.join("|"));
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
        loading={!hasLoaded}
        emptyLabel="No new listings in this area right now."
      />

      <HomeOpenHousesRail
        items={openHouses}
        href={seeAll({
          transactionType: "SALE",
          openHouseOnly: "1",
        })}
        loading={!hasLoaded}
      />

      <HomeSoldRail
        items={sold}
        isClient={isClient}
        needsEmailVerification={needsEmailVerification}
        seeAllHref={seeAll({ status: "SOLD", sort: "newest" })}
        loading={!hasLoaded}
        emptyLabel="No recently sold homes in this area right now."
      />

      <HomeListingRail
        id="rail-for-lease"
        title="For lease"
        href={seeAll({ transactionType: "LEASE", sort: "newest" })}
        items={forLease}
        loading={!hasLoaded}
        emptyLabel="No lease listings in this area right now."
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
        loading={!hasLoaded}
        emptyLabel="No commercial listings in this area right now."
      />
    </div>
  );
}
