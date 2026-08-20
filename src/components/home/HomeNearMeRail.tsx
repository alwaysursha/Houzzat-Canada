"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  NORMAL_LOCATION_MAX_AGE,
  NORMAL_LOCATION_TIMEOUT,
} from "@/lib/mobile/home-geolocation";
import {
  AppGeolocationError,
  locationErrorMessage,
  readLocationPermissionState,
} from "@/lib/mobile/geolocation";
import { mayResolveLocationPassively } from "@/lib/mobile/location-policy";
import { scheduleAfterFirstPaint } from "@/lib/mobile/schedule-idle";

type NearMeListing = ListingCardData & { distanceKm?: number };

type Status =
  | "idle"
  | "opt_in"
  | "unavailable"
  | "locating"
  | "loading"
  | "ready"
  | "empty"
  | "hidden";

export type NearMeRailStatus =
  | "ready"
  | "empty"
  | "hidden"
  | "opt_in"
  | "unavailable";

const NEAR_ME_RADIUS_KM = 35;
const NEAR_ME_LIMIT = 12;

export function HomeNearMeRail({
  personalization = null,
  onStatusChange,
}: {
  personalization?: HomepagePersonalizationQuery | null;
  onStatusChange?: (status: NearMeRailStatus, resultCount?: number) => void;
}) {
  const personalized = Boolean(personalization);
  const personalizationKey = personalized
    ? JSON.stringify(personalization)
    : "";
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [items, setItems] = useState<NearMeListing[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );

  function commitStatus(next: Status, resultCount = 0, detail?: string | null) {
    setStatus(next);
    setMessage(detail ?? null);
    if (!onStatusChange) return;
    if (next === "ready") {
      onStatusChange("ready", resultCount);
      return;
    }
    if (next === "empty") {
      onStatusChange("empty", 0);
      return;
    }
    if (next === "opt_in") {
      onStatusChange("opt_in", 1);
      return;
    }
    if (next === "unavailable") {
      onStatusChange("unavailable", 1);
      return;
    }
    if (next === "hidden") {
      onStatusChange("hidden", 0);
    }
  }

  async function loadNearby(lat: number, lng: number) {
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

  async function fetchWithLocation(requestPermission: boolean) {
    setPending(true);
    setMessage(null);
    try {
      const { lat, lng } = await getHomeCoordinates({
        timeout: NORMAL_LOCATION_TIMEOUT,
        maximumAge: NORMAL_LOCATION_MAX_AGE,
        emitEvent: true,
        requestPermission,
      });
      void persistHomeLocationIfEmpty({ lat, lng });
      await loadNearby(lat, lng);
    } catch (error) {
      const code =
        error instanceof AppGeolocationError ? error.code : "unknown";
      if (code === "denied") {
        commitStatus("unavailable", 0, locationErrorMessage(error));
        return;
      }
      if (code === "unavailable" || code === "timeout") {
        commitStatus("unavailable", 0, locationErrorMessage(error));
        return;
      }
      commitStatus("unavailable", 0, locationErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const permission = await readLocationPermissionState();
      if (cancelled) return;

      if (mayResolveLocationPassively(permission)) {
        await fetchWithLocation(false);
        return;
      }

      if (permission === "denied") {
        commitStatus(
          "unavailable",
          0,
          "Location access is turned off for Houzzat. Enable Location in Android settings → Apps → Houzzat to see homes near you.",
        );
        return;
      }

      // prompt | unknown — never auto-request OS permission.
      commitStatus("opt_in");
    }

    // Keep the hero free of GPS on first paint.
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

  if (status === "idle" || status === "locating" || status === "loading") {
    return null;
  }

  if (status === "hidden") {
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

  if (status === "opt_in" || status === "unavailable") {
    return (
      <section
        id="listings-near-me"
        className="scroll-mt-[calc(var(--site-header-stack)+env(safe-area-inset-top,0px)+1.25rem)]"
      >
        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-canopy/10 text-canopy">
              <MapPin className="size-5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-xl text-ink sm:text-2xl">
                Listings near me
              </h2>
              <p className="mt-1 text-sm text-ink/55">
                {status === "opt_in"
                  ? "See homes near you."
                  : (message ?? "Location isn’t available right now.")}
              </p>
            </div>
          </div>
          {status === "opt_in" ? (
            <Button
              type="button"
              disabled={pending}
              onClick={() => void fetchWithLocation(true)}
              className="shrink-0"
            >
              {pending ? "Locating…" : "Use my location"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => void fetchWithLocation(true)}
              className="shrink-0"
            >
              {pending ? "Trying…" : "Try again"}
            </Button>
          )}
        </div>
      </section>
    );
  }

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
