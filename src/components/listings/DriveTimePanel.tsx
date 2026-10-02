"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Briefcase,
  Car,
  GraduationCap,
  House,
  Map,
  Maximize2,
} from "lucide-react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { AddressAutocomplete } from "@/components/listings/AddressAutocomplete";
import type { AutocompleteSuggestion } from "@/lib/listings/types";
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM, OSM_STYLE } from "@/lib/maps/osm-style";
import { readThemeColor } from "@/lib/tenancy/read-theme-color";
import { cn } from "@/lib/utils";

type SlotId = "home" | "work" | "school";

type SavedDrive = {
  address: string;
  lat: number;
  lng: number;
  durationSeconds: number | null;
  distanceMeters: number | null;
  source?: "google" | "estimate";
};

type StoredPlace = {
  address: string;
  lat: number;
  lng: number;
};

const SLOTS: readonly SlotId[] = ["home", "work", "school"];

const SLOT_META: Record<SlotId, { label: string; icon: typeof House }> = {
  home: { label: "Home", icon: House },
  work: { label: "Work", icon: Briefcase },
  school: { label: "School", icon: GraduationCap },
};

function slotPhrase(slot: SlotId): string {
  switch (slot) {
    case "home":
      return "Home";
    case "work":
      return "Work";
    case "school":
      return "School";
    default: {
      const exhaustive: never = slot;
      return exhaustive;
    }
  }
}

/** Fallback when Routes has no result. Longer trips use a highway pace. */
function estimateDrive(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): { durationSeconds: number; distanceMeters: number } {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(destLat - originLat);
  const dLng = toRad(destLng - originLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(originLat)) *
      Math.cos(toRad(destLat)) *
      Math.sin(dLng / 2) ** 2;
  const straight = 2 * 6371000 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceMeters = Math.max(1, Math.round(straight * 1.3));
  const km = distanceMeters / 1000;
  const kmh = km < 3 ? 30 : km < 12 ? 42 : km < 30 ? 55 : 75;
  return {
    distanceMeters,
    durationSeconds: Math.max(
      60,
      Math.round(distanceMeters / ((kmh * 1000) / 3600)),
    ),
  };
}

function withEstimate(
  place: StoredPlace,
  originLat: number,
  originLng: number,
): SavedDrive {
  const drive = estimateDrive(originLat, originLng, place.lat, place.lng);
  return { ...place, ...drive, source: "estimate" };
}

function refreshEstimates(
  saved: Partial<Record<SlotId, SavedDrive>>,
  originLat: number,
  originLng: number,
): Partial<Record<SlotId, SavedDrive>> {
  const next: Partial<Record<SlotId, SavedDrive>> = {};
  for (const slot of SLOTS) {
    const place = saved[slot];
    if (!place) continue;
    next[slot] =
      place.source === "google"
        ? place
        : withEstimate(place, originLat, originLng);
  }
  return next;
}

async function lookupSignedInDrive(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): Promise<{ distanceMeters: number; durationSeconds: number } | null> {
  const res = await fetch("/api/routes/drive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ originLat, originLng, destLat, destLng }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    distanceMeters?: number;
    durationSeconds?: number;
  };
  if (data.distanceMeters == null || data.durationSeconds == null) return null;
  return {
    distanceMeters: data.distanceMeters,
    durationSeconds: data.durationSeconds,
  };
}

function formatDriveDistance(meters: number) {
  const km = meters / 1000;
  if (km < 1) return `${Math.round(meters)} m`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

function formatDriveDuration(seconds: number) {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hours} hr` : `${hours} hr ${rem} min`;
}

function storageKey(mlsNumber: string) {
  return `houzzat:drive-places:${mlsNumber}`;
}

function readSaved(mlsNumber: string): Partial<Record<SlotId, SavedDrive>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(storageKey(mlsNumber));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Record<SlotId, SavedDrive>>;
    const next: Partial<Record<SlotId, SavedDrive>> = {};
    for (const slot of SLOTS) {
      const row = parsed[slot];
      if (!row || typeof row.address !== "string") continue;
      if (typeof row.lat !== "number" || typeof row.lng !== "number") continue;
      next[slot] = {
        address: row.address,
        lat: row.lat,
        lng: row.lng,
        durationSeconds:
          typeof row.durationSeconds === "number" ? row.durationSeconds : null,
        distanceMeters:
          typeof row.distanceMeters === "number" ? row.distanceMeters : null,
        source: row.source === "google" ? "google" : "estimate",
      };
    }
    return next;
  } catch {
    return {};
  }
}

function mapsHref(
  originLat: number,
  originLng: number,
  place: SavedDrive | null,
) {
  const origin = `${originLat},${originLng}`;
  if (!place) {
    return `https://www.google.com/maps/search/?api=1&query=${origin}`;
  }
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination: `${place.lat},${place.lng}`,
    travelmode: "driving",
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function pinElement(color: string) {
  const el = document.createElement("div");
  el.style.width = "14px";
  el.style.height = "14px";
  el.style.borderRadius = "999px";
  el.style.background = color;
  el.style.border = "2px solid #fff";
  el.style.boxShadow = "0 1px 4px rgba(16,28,24,0.35)";
  return el;
}

function DriveRouteMap({
  originLat,
  originLng,
  dest,
  minutes,
}: {
  originLat: number;
  originLng: number;
  dest: SavedDrive | null;
  minutes: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    const map = new maplibregl.Map({
      container,
      style: OSM_STYLE,
      center: [originLng, originLat],
      zoom: 13,
      minZoom: MAP_MIN_ZOOM,
      maxZoom: MAP_MAX_ZOOM,
      attributionControl: false,
    });
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-left",
    );
    const resize = () => map.resize();
    map.on("load", resize);
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    mapRef.current = map;
    return () => {
      observer.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [originLat, originLng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;

    const draw = () => {
      if (cancelled) return;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [
        new maplibregl.Marker({ element: pinElement("#1a1a1a") })
          .setLngLat([originLng, originLat])
          .addTo(map),
      ];
      const route = map.getSource("drive-route") as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!dest) {
        route?.setData({ type: "FeatureCollection", features: [] });
        map.easeTo({ center: [originLng, originLat], zoom: 14, duration: 400 });
        return;
      }
      markersRef.current.push(
        new maplibregl.Marker({ element: pinElement("#e11d2e") })
          .setLngLat([dest.lng, dest.lat])
          .addTo(map),
      );
      const line = {
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [originLng, originLat],
            [dest.lng, dest.lat],
          ],
        },
      };
      if (route) {
        route.setData(line);
      } else {
        map.addSource("drive-route", { type: "geojson", data: line });
        map.addLayer({
          id: "drive-route",
          type: "line",
          source: "drive-route",
          paint: {
            "line-color": readThemeColor("--canopy", "#0F6B4C"),
            "line-width": 4,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
      }
      const bounds = new maplibregl.LngLatBounds(
        [originLng, originLat],
        [originLng, originLat],
      );
      bounds.extend([dest.lng, dest.lat]);
      map.fitBounds(bounds, { padding: 36, maxZoom: 14, duration: 450 });
    };

    if (map.isStyleLoaded()) draw();
    else map.once("load", draw);
    return () => {
      cancelled = true;
    };
  }, [dest, originLat, originLng]);

  return (
    <div className="relative h-full min-h-36 overflow-hidden rounded-2xl bg-mist">
      <div
        ref={containerRef}
        className="h-full min-h-36 w-full [&_.maplibregl-canvas]:!h-full [&_.maplibregl-canvas]:!w-full"
      />
      {minutes ? (
        <span className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-lg bg-canopy px-2 py-0.5 text-xs font-semibold text-white shadow-sm">
          {minutes}
        </span>
      ) : null}
    </div>
  );
}

export function DriveTimePanel({
  mlsNumber,
  originLat,
  originLng,
  originLabel,
}: {
  mlsNumber: string;
  originLat: number;
  originLng: number;
  originLabel: string;
}) {
  const [places, setPlaces] = useState<Partial<Record<SlotId, SavedDrive>>>(() =>
    refreshEstimates(readSaved(mlsNumber), originLat, originLng),
  );
  const [selected, setSelected] = useState<SlotId | null>(() => {
    const saved = refreshEstimates(readSaved(mlsNumber), originLat, originLng);
    return SLOTS.find((slot) => saved[slot]) ?? null;
  });
  const [listingKey, setListingKey] = useState(mlsNumber);
  const [editing, setEditing] = useState<SlotId | null>(null);
  const [peak, setPeak] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [saving, setSaving] = useState<SlotId | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [measuring, setMeasuring] = useState(false);

  if (listingKey !== mlsNumber) {
    const saved = readSaved(mlsNumber);
    setListingKey(mlsNumber);
    setPlaces(refreshEstimates(saved, originLat, originLng));
    setSelected(SLOTS.find((slot) => saved[slot]) ?? null);
    setEditing(null);
    setMeasuring(false);
  }

  /**
   * Load saved Home / Work / School. Do not call Google here — that only runs
   * when the address is first saved on a listing, or when they tap Get drive times.
   */
  useEffect(() => {
    let cancelled = false;
    const saved = readSaved(mlsNumber);

    void (async () => {
      try {
        const res = await fetch("/api/account/commute");
        if (!res.ok) {
          if (!cancelled) setSignedIn(false);
          return;
        }
        const data = (await res.json()) as {
          places?: Partial<Record<SlotId, StoredPlace | null>>;
        };
        if (cancelled || !data.places) return;
        setSignedIn(true);
        const merged: Partial<Record<SlotId, SavedDrive>> = { ...saved };
        for (const slot of SLOTS) {
          const row = data.places[slot];
          if (!row || typeof row.address !== "string") continue;
          if (typeof row.lat !== "number" || typeof row.lng !== "number") continue;
          const existing = saved[slot];
          const keepGoogle =
            existing &&
            existing.lat === row.lat &&
            existing.lng === row.lng &&
            existing.source === "google" &&
            existing.durationSeconds != null;
          merged[slot] = keepGoogle
            ? { ...existing, address: row.address }
            : withEstimate(
                { address: row.address, lat: row.lat, lng: row.lng },
                originLat,
                originLng,
              );
        }
        if (cancelled) return;
        window.sessionStorage.setItem(storageKey(mlsNumber), JSON.stringify(merged));
        setPlaces(merged);
        setSelected((current) => {
          if (current && (saved[current] || data.places?.[current])) return current;
          return (
            SLOTS.find((slot) => data.places?.[slot] || saved[slot]) ?? null
          );
        });
      } catch {
        if (!cancelled) setSignedIn(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mlsNumber, originLat, originLng]);

  const needsDriveMeasure = useMemo(
    () =>
      signedIn &&
      SLOTS.some((slot) => {
        const place = places[slot];
        return Boolean(place && place.source !== "google");
      }),
    [places, signedIn],
  );

  async function measureSavedDrives() {
    if (measuring || !needsDriveMeasure) return;
    setMeasuring(true);
    const next: Partial<Record<SlotId, SavedDrive>> = { ...places };
    for (const slot of SLOTS) {
      const place = next[slot];
      if (!place || place.source === "google") continue;
      const measured = await lookupSignedInDrive(
        originLat,
        originLng,
        place.lat,
        place.lng,
      );
      if (!measured) continue;
      next[slot] = { ...place, ...measured, source: "google" };
    }
    window.sessionStorage.setItem(storageKey(mlsNumber), JSON.stringify(next));
    setPlaces(next);
    setMeasuring(false);
  }

  const active = selected ? (places[selected] ?? null) : null;
  const shownSeconds = useMemo(() => {
    if (active?.durationSeconds == null) return null;
    return peak ? Math.round(active.durationSeconds * 1.35) : active.durationSeconds;
  }, [active, peak]);
  const minutesLabel =
    shownSeconds != null ? formatDriveDuration(shownSeconds) : null;

  async function savePlace(place: AutocompleteSuggestion) {
    if (!editing || place.lat == null || place.lng == null) return;
    const slot = editing;
    const label = place.subtitle ?? place.label;
    const estimated = withEstimate(
      { address: label, lat: place.lat, lng: place.lng },
      originLat,
      originLng,
    );
    setSelected(slot);
    setSaving(slot);
    setEditing(null);
    setPlaces((current) => {
      const next = { ...current, [slot]: estimated };
      window.sessionStorage.setItem(storageKey(mlsNumber), JSON.stringify(next));
      return next;
    });

    let signedIn = false;
    try {
      const savedAccount = await fetch("/api/account/commute", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slot,
          address: label,
          lat: place.lat,
          lng: place.lng,
        }),
      });
      signedIn = savedAccount.ok;
      if (signedIn) setSignedIn(true);
    } catch {
      signedIn = false;
    }

    if (signedIn) {
      const measured = await lookupSignedInDrive(
        originLat,
        originLng,
        place.lat,
        place.lng,
      );
      if (measured) {
        const row: SavedDrive = {
          ...estimated,
          ...measured,
          source: "google",
        };
        setPlaces((current) => {
          const next = { ...current, [slot]: row };
          window.sessionStorage.setItem(storageKey(mlsNumber), JSON.stringify(next));
          return next;
        });
      }
    }
    setSaving(null);
  }

  return (
    <section
      id="listing-drive"
      className="@container overflow-visible rounded-[22px] border border-line/80 bg-white p-3.5 shadow-[0_10px_30px_-22px_rgba(16,28,24,0.45)] sm:p-4"
    >
      <div className="flex flex-col gap-3.5 @min-[40rem]:flex-row @min-[40rem]:items-stretch">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-canopy/10 text-canopy">
              <Car className="size-5" strokeWidth={2.1} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl font-semibold leading-none tracking-tight text-ink">
                Drive time
              </h2>
              <p className="mt-1 truncate text-sm text-ink/55">
                From {originLabel}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            {SLOTS.map((slot) => {
              const meta = SLOT_META[slot];
              const Icon = meta.icon;
              const place = places[slot];
              const activeSlot = selected === slot;
              const seconds =
                place?.durationSeconds == null
                  ? null
                  : peak
                    ? Math.round(place.durationSeconds * 1.35)
                    : place.durationSeconds;
              return (
                <div
                  key={slot}
                  className={cn(
                    "flex min-w-0 items-center gap-2 rounded-2xl border px-2.5 py-2 transition duration-200",
                    activeSlot
                      ? "border-canopy/35 bg-canopy/5"
                      : "border-line/70 bg-white",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (place) setSelected(slot);
                      else setEditing(slot);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    aria-pressed={activeSlot}
                  >
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        activeSlot ? "text-canopy" : "text-ink/40",
                      )}
                      strokeWidth={2}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-ink">
                        {meta.label}
                      </span>
                      <span className="block truncate text-[11px] text-ink/50">
                        {place?.address ?? "No address yet"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-bold tracking-tight text-ink">
                        {saving === slot
                          ? "…"
                          : seconds != null
                            ? formatDriveDuration(seconds)
                            : "—"}
                      </span>
                      {place?.distanceMeters != null ? (
                        <span className="block text-[10px] font-medium text-ink/45">
                          {formatDriveDistance(place.distanceMeters)}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(slot)}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-canopy transition hover:bg-canopy/10"
                  >
                    {place ? "Change" : "Add"}
                  </button>
                </div>
              );
            })}
          </div>

          {needsDriveMeasure ? (
            <button
              type="button"
              onClick={() => {
                void measureSavedDrives();
              }}
              disabled={measuring}
              className="w-full rounded-xl border border-canopy/25 bg-canopy/5 px-3 py-2.5 text-sm font-semibold text-canopy transition hover:bg-canopy/10 disabled:opacity-60"
            >
              {measuring ? "Getting drive times…" : "Get drive times"}
            </button>
          ) : null}

          {editing ? (
            <div className="space-y-2 rounded-2xl border border-canopy/20 bg-canopy/5 p-2.5">
              <p className="text-xs font-semibold text-ink">
                Save this address as {slotPhrase(editing)}
              </p>
              <AddressAutocomplete
                key={`${editing}:${places[editing]?.address ?? ""}`}
                source="google"
                fillOnly
                fieldMenu
                initialQuery={places[editing]?.address ?? ""}
                placeholder={`${slotPhrase(editing)} address`}
                inputClassName="h-11 rounded-xl border border-line/80 bg-white pl-10 text-sm shadow-none placeholder:text-ink/40 focus-visible:ring-2 focus-visible:ring-canopy/30"
                onPlaceSelect={(place) => {
                  void savePlace(place);
                }}
              />
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="text-xs font-semibold text-ink/50 transition hover:text-ink"
              >
                Cancel
              </button>
            </div>
          ) : null}

          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-ink/80">
            <input
              type="checkbox"
              checked={peak}
              onChange={(event) => setPeak(event.target.checked)}
              className="size-4 rounded border-line accent-canopy"
            />
            During peak hours
          </label>
        </div>

        <div className="flex min-w-0 flex-col gap-2 @min-[40rem]:w-40">
          <div
            className={cn(
              "relative transition-[height] duration-300",
              mapExpanded ? "h-64" : "h-44 @min-[40rem]:h-full @min-[40rem]:min-h-40",
            )}
          >
            <DriveRouteMap
              originLat={originLat}
              originLng={originLng}
              dest={active}
              minutes={minutesLabel}
            />
            <button
              type="button"
              onClick={() => setMapExpanded((open) => !open)}
              aria-label={mapExpanded ? "Shrink map" : "Expand map"}
              className="absolute bottom-2 right-2 z-10 flex size-8 items-center justify-center rounded-lg border border-line/70 bg-white/95 text-ink/70 shadow-sm transition hover:text-ink @min-[40rem]:hidden"
            >
              <Maximize2 className="size-3.5" aria-hidden />
            </button>
          </div>
          <a
            href={mapsHref(originLat, originLng, active)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-1 py-1 text-sm font-semibold text-canopy transition hover:text-canopy-deep @min-[40rem]:hidden"
          >
            <Map className="size-4" aria-hidden />
            <span className="flex-1">Open in Map</span>
            <span aria-hidden>›</span>
          </a>
        </div>
      </div>
    </section>
  );
}
