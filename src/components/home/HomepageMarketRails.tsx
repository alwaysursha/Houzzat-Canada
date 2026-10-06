"use client";

import { useEffect, useRef, useState } from "react";
import { HomeListingRail } from "@/components/home/HomeListingRail";
import { HomeOpenHousesRail } from "@/components/home/HomeOpenHousesRail";
import { HomeSoldRail } from "@/components/home/HomeSoldRail";
import { EMAIL_VERIFIED_EVENT } from "@/lib/auth/verification-success-signal";
import {
  citiesQueryParam,
  resolveRegionFromCity,
  resolveRegionFromCoords,
  type MarketRegion,
} from "@/lib/geo/regions";
import { homeRailsClientFetchInit } from "@/lib/listings/home-rails-access";
import type { HomepagePersonalizationQuery } from "@/lib/listings/homepage-personalization";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import {
  getHomeCoordinates,
  HOME_GEO_EVENT,
  NORMAL_LOCATION_MAX_AGE,
  NORMAL_LOCATION_TIMEOUT,
  readCachedHomeCoordinates,
} from "@/lib/mobile/home-geolocation";
import { readLocationPermissionState } from "@/lib/mobile/geolocation";
import {
  mayResolveLocationPassively,
  shouldUpgradeHomeRailsRegion,
} from "@/lib/mobile/location-policy";
import { scheduleAfterFirstPaint } from "@/lib/mobile/schedule-idle";
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
    minBeds: personalization.minBeds,
    minBaths: personalization.minBaths,
    propertyTypes: personalization.propertyTypes?.join(","),
    communities: personalization.communities?.length
      ? personalization.communities.join("|")
      : undefined,
    transactionType:
      personalization.transactionType &&
      personalization.transactionType !== "ALL"
        ? personalization.transactionType
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
  /** Bumps on EMAIL_VERIFIED_EVENT so rails refetch even if isClient was already true (grace). */
  const [accessEpoch, setAccessEpoch] = useState(0);
  const regionIdRef = useRef(region.id);
  regionIdRef.current = region.id;
  const isClientRef = useRef(isClient);
  isClientRef.current = isClient;

  const personalizedCities = personalizationCities(personalization);
  const personalizationKey = JSON.stringify({
    cities: personalizedCities,
    ...personalizationQuery(personalization),
  });

  useEffect(() => {
    function onEmailVerified() {
      setAccessEpoch((n) => n + 1);
    }
    window.addEventListener(EMAIL_VERIFIED_EVENT, onEmailVerified);
    return () => {
      window.removeEventListener(EMAIL_VERIFIED_EVENT, onEmailVerified);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let requestId = 0;
    /** Regions already geo-upgraded this effect cycle — blocks double fetch. */
    const upgradedRegionIds = new Set<string>();

    async function resolveBrowseRegion(): Promise<MarketRegion> {
      const personalizedCities = personalizationCities(personalization);
      if (personalizedCities.length) {
        setOverrideCities(personalizedCities);
        return resolveRegionFromCity(personalizedCities[0] ?? null).region;
      }
      setOverrideCities(null);

      const cached = readCachedHomeCoordinates(NORMAL_LOCATION_MAX_AGE);
      if (cached) {
        return resolveRegionFromCoords(cached.lat, cached.lng).region;
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
      const clientAccess = isClientRef.current;

      try {
        const res = await fetch(
          homeRailsUrl(cities, extras),
          homeRailsClientFetchInit(clientAccess),
        );
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

    function tryGeoUpgrade(lat: number, lng: number) {
      if (
        vowOnlyGuest ||
        personalizationCities(personalization).length ||
        cancelled
      ) {
        return;
      }
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const next = resolveRegionFromCoords(lat, lng).region;
      if (
        !shouldUpgradeHomeRailsRegion({
          currentRegionId: regionIdRef.current,
          nextRegionId: next.id,
          upgradedRegionIds,
        })
      ) {
        return;
      }
      upgradedRegionIds.add(next.id);
      void loadForRegion(next);
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

      // Passive only — never request OS permission from market rails.
      try {
        const permission = await readLocationPermissionState();
        if (!mayResolveLocationPassively(permission)) return;
        const { lat, lng } = await getHomeCoordinates({
          timeout: NORMAL_LOCATION_TIMEOUT,
          maximumAge: NORMAL_LOCATION_MAX_AGE,
          emitEvent: false,
          requestPermission: false,
        });
        if (cancelled) return;
        tryGeoUpgrade(lat, lng);
      } catch {
        // ignore geo upgrade failures (timeout / GPS off / etc.)
      }
    }

    function onGeo(event: Event) {
      const detail = (event as CustomEvent<{ lat: number; lng: number }>).detail;
      if (!detail) return;
      tryGeoUpgrade(detail.lat, detail.lng);
    }

    window.addEventListener(HOME_GEO_EVENT, onGeo);
    // Defer market fetch slightly so the hero paints first — still starts
    // quickly via idle timeout so the finished page is not slower overall.
    // Access-change refetches (isClient / email verified) skip the first-paint
    // delay so sold prices update promptly after login/verification.
    const deferMs = loadedRef.current || isClient || accessEpoch > 0 ? 0 : 900;
    const cancelSchedule = scheduleAfterFirstPaint(
      () => {
        if (!cancelled) void load();
      },
      { timeoutMs: deferMs },
    );
    return () => {
      cancelled = true;
      cancelSchedule();
      window.removeEventListener(HOME_GEO_EVENT, onGeo);
    };
  }, [personalizationKey, vowOnlyGuest, isClient, accessEpoch]);

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
