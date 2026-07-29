"use client";

import { useEffect, useState } from "react";
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

type SearchPayload = {
  items?: ListingCardData[];
};

function searchUrl(params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") q.set(key, value);
  }
  return `/api/listings/search?${q.toString()}`;
}

function openHousesUrl(
  cities: string[],
  extras: Record<string, string | undefined>,
) {
  const q = new URLSearchParams({
    cities: citiesQueryParam(cities),
  });
  for (const [key, value] of Object.entries(extras)) {
    if (value) q.set(key, value);
  }
  return `/api/listings/open-houses?${q.toString()}`;
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

async function fetchSearch(
  params: Record<string, string | undefined>,
): Promise<ListingCardData[]> {
  const res = await fetch(searchUrl(params), { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as SearchPayload;
  return data.items ?? [];
}

export function HomepageMarketRails({
  isClient,
  vowOnlyGuest,
  personalization,
}: {
  isClient: boolean;
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
          if (
            Number.isFinite(parsed.lat) &&
            Number.isFinite(parsed.lng)
          ) {
            return resolveRegionFromCoords(parsed.lat, parsed.lng).region;
          }
        }
      } catch {
        // ignore cache parse
      }

      // Prefer cached / already-granted geo. If still unknown, start with the
      // default city set — Near Me (or a later grant) upgrades via houzzat:geo.
      let permission: PermissionState | "unknown" = "unknown";
      try {
        if (navigator.permissions?.query) {
          permission = (
            await navigator.permissions.query({ name: "geolocation" })
          ).state;
        }
      } catch {
        permission = "unknown";
      }

      if (permission === "denied") {
        return resolveRegionFromCity(null).region;
      }

      if (permission !== "granted") {
        return resolveRegionFromCity(null).region;
      }

      try {
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 8000,
              maximumAge: 300_000,
            });
          },
        );
        const { latitude: lat, longitude: lng } = position.coords;
        try {
          sessionStorage.setItem(
            GEO_REGION_KEY,
            JSON.stringify({ lat, lng }),
          );
        } catch {
          // ignore
        }
        return resolveRegionFromCoords(lat, lng).region;
      } catch {
        return resolveRegionFromCity(null).region;
      }
    }

    async function loadForRegion(nextRegion: MarketRegion) {
      if (cancelled) return;
      setRegion(nextRegion);

      const cities = citiesQueryParam(nextRegion.cities);
      const extras = personalizationQuery(personalization);

      const [fresh, oh, soldRows, leaseRows, commercialRows] =
        await Promise.all([
          fetchSearch({
            status: "ACTIVE",
            segment: "RESIDENTIAL",
            transactionType: "SALE",
            sort: "newest",
            limit: String(RAIL_LIMIT),
            cities,
            ...extras,
          }),
          fetch(openHousesUrl(nextRegion.cities, extras), { cache: "no-store" })
            .then(async (res) => {
              if (!res.ok) return [] as ListingCardData[];
              const data = (await res.json()) as SearchPayload;
              return data.items ?? [];
            })
            .catch(() => [] as ListingCardData[]),
          fetchSearch({
            status: "SOLD",
            segment: "ALL",
            transactionType: "SALE",
            sort: "newest",
            limit: String(RAIL_LIMIT),
            cities,
            ...extras,
          }),
          fetchSearch({
            status: "ACTIVE",
            segment: "ALL",
            transactionType: "LEASE",
            sort: "newest",
            limit: String(RAIL_LIMIT),
            cities,
            ...extras,
          }),
          fetchSearch({
            status: "ACTIVE",
            segment: "COMMERCIAL",
            transactionType: "SALE",
            sort: "newest",
            limit: String(RAIL_LIMIT),
            cities,
            ...extras,
          }),
        ]);

      if (cancelled) return;
      setNewListings(fresh);
      setOpenHouses(oh);
      setSold(
        isClient
          ? soldRows
          : soldRows.map((item) => ({ ...item, soldPrice: null })),
      );
      setForLease(leaseRows);
      setCommercial(commercialRows);
      setReady(true);
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
