"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { FreeSwipeRail } from "@/components/home/FreeSwipeRail";
import { ListingCard } from "@/components/listings/ListingCard";
import { persistHomeLocationIfEmpty } from "@/lib/account/persist-home-location";
import {
  appendPersonalizationToUrlSearchParams,
  personalizationToSearchHref,
  type HomepagePersonalizationQuery,
} from "@/lib/listings/homepage-personalization";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import {
  getHomeCoordinates,
} from "@/lib/mobile/home-geolocation";
import {
  AppGeolocationError,
  locationErrorMessage,
  readLocationPermissionState,
} from "@/lib/mobile/geolocation";
import { scheduleAfterFirstPaint } from "@/lib/mobile/schedule-idle";

type NearMeListing = ListingCardData & { distanceKm?: number };

type Status = "idle" | "locating" | "loading" | "ready" | "empty" | "hidden";

const GEO_ASKED_KEY = "houzzat-geo-asked";
const NEAR_ME_RADIUS_KM = 35;
const NEAR_ME_LIMIT = 12;

export function HomeNearMeRail({
  personalization = null,
  onStatusChange,
}: {
  personalization?: HomepagePersonalizationQuery | null;
  onStatusChange?: (
    status: "ready" | "empty" | "hidden",
    resultCount?: number,
  ) => void;
}) {
  const personalized = Boolean(personalization);
  const personalizationKey = personalized
    ? JSON.stringify(personalization)
    : "";
  const { alert } = useSiteAlert();
  const [status, setStatus] = useState<Status>("idle");
  const [items, setItems] = useState<NearMeListing[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );

  function commitStatus(next: Status, resultCount = 0) {
    setStatus(next);
    if (!onStatusChange) return;
    if (next === "ready") {
      onStatusChange("ready", resultCount);
      return;
    }
    if (next === "empty") {
      onStatusChange("empty", 0);
      return;
    }
    if (next === "hidden") {
      onStatusChange("hidden", 0);
    }
  }

  async function loadNearby(lat: number, lng: number) {
    setStatus("loading");
    try {
      const params = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
        radiusKm: String(NEAR_ME_RADIUS_KM),
        limit: String(NEAR_ME_LIMIT),
      });
      appendPersonalizationToUrlSearchParams(params, personalization);
      const res = await fetch(`/api/listings/nearby?${params.toString()}`);
      const data = (await res.json()) as {
        items?: NearMeListing[];
        error?: string;
      };
      if (!res.ok) {
        commitStatus("hidden");
        return;
      }
      const next = data.items ?? [];
      setItems(next);
      setCoords({ lat, lng });
      if (next.length > 0) {
        commitStatus("ready", next.length);
      } else if (personalized) {
        commitStatus("empty");
      } else {
        commitStatus("hidden");
      }
    } catch {
      commitStatus("hidden");
    }
  }

  async function fetchWithLocation() {
    setStatus("locating");
    try {
      const { lat, lng } = await getHomeCoordinates({
        timeout: 12_000,
        maximumAge: 60_000,
        emitEvent: true,
      });
      void persistHomeLocationIfEmpty({ lat, lng });
      await loadNearby(lat, lng);
    } catch (error) {
      commitStatus("hidden");
      const denied =
        error instanceof AppGeolocationError && error.code === "denied";
      // Auto-rail: only explain permission denial (not timeouts / GPS blips).
      if (denied) {
        await alert({
          title: "Location not available",
          message: locationErrorMessage(error),
          confirmLabel: "Got it",
        });
      }
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const permission = await readLocationPermissionState();
      if (cancelled) return;

      if (permission === "granted") {
        await fetchWithLocation();
        return;
      }

      if (permission === "denied") {
        commitStatus("hidden");
        return;
      }

      // permission === "prompt" | "unknown"
      // Avoid a double prompt (site modal + OS). Go straight to the OS prompt.
      const alreadyAsked =
        typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem(GEO_ASKED_KEY) === "1";

      if (alreadyAsked) {
        commitStatus("hidden");
        return;
      }

      try {
        sessionStorage.setItem(GEO_ASKED_KEY, "1");
      } catch {
        // ignore
      }
      await fetchWithLocation();
    }

    // Keep the hero free of GPS + nearby fetch on first paint.
    const cancelSchedule = scheduleAfterFirstPaint(
      () => {
        if (!cancelled) void init();
      },
      { timeoutMs: 1_400 },
    );

    return () => {
      cancelled = true;
      cancelSchedule();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch when personalizationKey changes
  }, [personalizationKey]);

  if (status !== "ready" && status !== "empty") {
    return null;
  }

  const mapHref = coords
    ? personalization
      ? personalizationToSearchHref(personalization, {
          lat: String(coords.lat),
          lng: String(coords.lng),
        })
      : `/search?lat=${coords.lat}&lng=${coords.lng}`
    : personalization
      ? personalizationToSearchHref(personalization)
      : "/search";

  return (
    <section
      id="listings-near-me"
      className="scroll-mt-[calc(var(--site-header-stack)+env(safe-area-inset-top,0px)+1.25rem)] space-y-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-2xl text-ink">Listings near me</h2>
        <Link href={mapHref} className="text-sm font-semibold text-canopy">
          Open map →
        </Link>
      </div>

      {status === "empty" || items.length === 0 ? (
        <p className="text-sm text-ink/50">
          No homes near you match your homepage search.
        </p>
      ) : (
        <FreeSwipeRail label="Listings near me">
          {items.map((listing) => (
            <ListingCard
              key={listing.mlsNumber}
              listing={listing}
              distanceKm={listing.distanceKm}
            />
          ))}
        </FreeSwipeRail>
      )}
    </section>
  );
}
