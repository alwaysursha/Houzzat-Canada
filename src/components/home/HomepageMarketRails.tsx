"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HomeListingRail } from "@/components/home/HomeListingRail";
import { HomeOpenHousesRail } from "@/components/home/HomeOpenHousesRail";
import { HomeSoldRail } from "@/components/home/HomeSoldRail";
import { useHomepageSearchSource } from "@/components/home/use-homepage-search-source";
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

/** Cities from homepage personalization query (Primary or Active). */
function personalizationCities(
  personalization: HomepagePersonalizationQuery | null | undefined,
): string[] {
  if (!personalization) return [];
  if (personalization.cities?.length) return personalization.cities;
  if (personalization.city) return [personalization.city];
  return [];
}

function homeRailsUrl(cities: string) {
  const q = new URLSearchParams({
    cities,
    limit: String(RAIL_LIMIT),
  });
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
  /** Server Primary (SSR hint). Client Primary ≻ Active wins via hook. */
  personalization: HomepagePersonalizationQuery | null;
}) {
  const { source, ready: sourceReady } = useHomepageSearchSource();

  /**
   * City scope only — never buyer price/beds/property-type filters on category
   * rails. Primary Home Search cities win; else meaningful Active Search.
   */
  const scopedCities = useMemo(() => {
    if (sourceReady && source?.query) {
      return personalizationCities(source.query);
    }
    // Hydrate window: keep SSR Primary cities to avoid a geo flash.
    return personalizationCities(personalization);
  }, [sourceReady, source, personalization]);

  const [region, setRegion] = useState<MarketRegion>(() =>
    resolveRegionFromCity(scopedCities[0] ?? null).region,
  );
  const [overrideCities, setOverrideCities] = useState<string[] | null>(() =>
    scopedCities.length ? scopedCities : null,
  );
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

  const cityScopeKey = scopedCities.join("|");

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
      if (scopedCities.length) {
        setOverrideCities(scopedCities);
        return resolveRegionFromCity(scopedCities[0] ?? null).region;
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

      // Personalized city scope uses exact selected cities — never expand to
      // unrelated region cities as fallback matches.
      const cities = citiesQueryParam(
        cityOverride?.length ? cityOverride : nextRegion.cities,
      );
      const clientAccess = isClientRef.current;

      try {
        const res = await fetch(
          homeRailsUrl(cities),
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
      if (vowOnlyGuest || scopedCities.length || cancelled) {
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
      await loadForRegion(
        nextRegion,
        scopedCities.length ? scopedCities : null,
      );

      if (scopedCities.length || cancelled) return;

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
  }, [cityScopeKey, vowOnlyGuest, isClient, accessEpoch, scopedCities]);

  const citiesParam = citiesQueryParam(
    overrideCities?.length ? overrideCities : region.cities,
  );

  /** Category rails: city scope only + each rail’s own status/txn/segment rules. */
  const seeAll = (extra: Record<string, string>) => {
    const q = new URLSearchParams({ cities: citiesParam, ...extra });
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
