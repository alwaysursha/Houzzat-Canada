"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  Car,
  GraduationCap,
  House,
  Map,
  Maximize2,
  Pencil,
} from "lucide-react";
import { AddressAutocomplete } from "@/components/listings/AddressAutocomplete";
import type { AutocompleteSuggestion } from "@/lib/listings/types";
import { cn } from "@/lib/utils";

type SlotId = "home" | "work" | "school";

type SavedDrive = {
  address: string;
  lat: number;
  lng: number;
  durationSeconds: number | null;
  distanceMeters: number | null;
};

const SLOTS: readonly SlotId[] = ["home", "work", "school"];

const SLOT_META: Record<
  SlotId,
  { label: string; icon: typeof House; tone: string; selected: string }
> = {
  home: {
    label: "Home",
    icon: House,
    tone: "border-[#d7e4ff] bg-[#f4f8ff] text-[#2457d6]",
    selected: "border-[#2457d6]/35 bg-[#eaf1ff] shadow-[0_8px_20px_-14px_rgba(36,87,214,0.9)]",
  },
  work: {
    label: "Work",
    icon: Briefcase,
    tone: "border-[#d5f0df] bg-[#f3fbf6] text-[#17803d]",
    selected: "border-[#17803d]/35 bg-[#e7f7ed] shadow-[0_8px_20px_-14px_rgba(23,128,61,0.9)]",
  },
  school: {
    label: "School",
    icon: GraduationCap,
    tone: "border-[#e4d9ff] bg-[#f7f3ff] text-[#6d28d9]",
    selected: "border-[#6d28d9]/35 bg-[#f3ecff] shadow-[0_8px_20px_-14px_rgba(109,40,217,0.9)]",
  },
};

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

function RouteSketch({
  dashed,
  minutes,
}: {
  dashed: boolean;
  minutes: string | null;
}) {
  return (
    <div className="relative h-full min-h-36 overflow-hidden rounded-2xl bg-[#e7f0e4]">
      <svg
        viewBox="0 0 320 200"
        className="absolute inset-0 size-full"
        aria-hidden
      >
        <rect width="320" height="200" fill="#e6f1df" />
        <path d="M0 40 C80 28 120 70 200 52 S300 20 320 36" stroke="#d5e4c8" strokeWidth="18" fill="none" />
        <path d="M0 120 C70 100 140 150 220 128 S300 150 320 110" stroke="#f3f7ef" strokeWidth="22" fill="none" />
        <path d="M40 0 V200 M120 0 V200 M200 0 V200 M270 0 V200" stroke="#d3e2c7" strokeWidth="1.2" />
        <path d="M0 60 H320 M0 130 H320" stroke="#d3e2c7" strokeWidth="1.2" />
        <path
          d="M78 46 C110 70 128 118 168 126 S230 150 252 118"
          stroke="#1a73e8"
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={dashed ? "8 7" : undefined}
        />
        <circle cx="78" cy="46" r="9" fill="#1a1a1a" />
        <path d="M78 28c6 0 10 4.2 10 9.6 0 7-10 16.4-10 16.4s-10-9.4-10-16.4c0-5.4 4-9.6 10-9.6z" fill="#1a1a1a" />
        <circle cx="252" cy="118" r="8" fill="#e11d2e" />
        <path d="M252 96c6.2 0 11 4.6 11 10.4 0 7.6-11 18-11 18s-11-10.4-11-18C241 100.6 245.8 96 252 96z" fill="#e11d2e" />
      </svg>
      {minutes ? (
        <span className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-[#1a73e8] px-2 py-0.5 text-xs font-semibold text-white shadow-sm @min-[40rem]:hidden">
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
  const [places, setPlaces] = useState<Partial<Record<SlotId, SavedDrive>>>({});
  const [selected, setSelected] = useState<SlotId>("work");
  const [saveAs, setSaveAs] = useState<SlotId>("work");
  const [editing, setEditing] = useState(false);
  const [peak, setPeak] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = readSaved(mlsNumber);
    setPlaces(saved);
    const first = SLOTS.find((slot) => saved[slot]);
    if (first) {
      setSelected(first);
      setSaveAs(first);
    }
  }, [mlsNumber]);

  const active = places[selected] ?? null;
  const shownSeconds = useMemo(() => {
    if (active?.durationSeconds == null) return null;
    return peak ? Math.round(active.durationSeconds * 1.35) : active.durationSeconds;
  }, [active, peak]);

  async function savePlace(place: AutocompleteSuggestion) {
    if (place.lat == null || place.lng == null) return;
    const destLat = place.lat;
    const destLng = place.lng;
    const slot = saveAs;
    const label = place.subtitle ?? place.label;
    setSelected(slot);
    setLoading(true);
    let durationSeconds: number | null = null;
    let distanceMeters: number | null = null;
    try {
      const res = await fetch("/api/routes/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originLat,
          originLng,
          destLat,
          destLng,
        }),
      });
      const data = (await res.json()) as {
        distanceMeters?: number;
        durationSeconds?: number;
      };
      if (res.ok && data.distanceMeters != null && data.durationSeconds != null) {
        distanceMeters = data.distanceMeters;
        durationSeconds = data.durationSeconds;
      }
    } catch {
      durationSeconds = null;
      distanceMeters = null;
    } finally {
      setLoading(false);
    }
    const row: SavedDrive = {
      address: label,
      lat: destLat,
      lng: destLng,
      durationSeconds,
      distanceMeters,
    };
    setPlaces((current) => {
      const next = { ...current, [slot]: row };
      window.sessionStorage.setItem(storageKey(mlsNumber), JSON.stringify(next));
      return next;
    });
  }

  function chooseSlot(slot: SlotId) {
    if (places[slot]) {
      setSelected(slot);
      setSaveAs(slot);
      return;
    }
    setSaveAs(slot);
    setEditing(true);
  }

  return (
    <section
      id="listing-drive"
      className="@container overflow-hidden rounded-[22px] border border-line/80 bg-white p-3.5 shadow-[0_10px_30px_-22px_rgba(16,28,24,0.45)] sm:p-4"
    >
      <div className="flex flex-col gap-3.5 @min-[40rem]:flex-row @min-[40rem]:items-stretch">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#e8f1ff] text-[#2457d6]">
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
            <button
              type="button"
              onClick={() => setEditing((open) => !open)}
              aria-expanded={editing}
              className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[#2457d6] transition hover:text-[#1d4ed8]"
            >
              {editing ? "Done" : "Edit"}
              <Pencil className="size-3.5 @min-[40rem]:hidden" aria-hidden />
            </button>
          </div>

          <div className="relative">
            <AddressAutocomplete
              source="google"
              fillOnly
              portalDesktopSuggestions
              placeholder="Enter a destination"
              inputClassName="h-11 rounded-xl border border-line/80 bg-white pl-10 text-sm shadow-none placeholder:text-ink/40 focus-visible:ring-2 focus-visible:ring-[#2457d6]/30"
              onPlaceSelect={(place) => {
                void savePlace(place);
              }}
            />
          </div>

          {editing ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-ink/45">Save as</span>
              {SLOTS.map((slot) => {
                const meta = SLOT_META[slot];
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSaveAs(slot)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-semibold transition",
                      saveAs === slot
                        ? meta.selected
                        : "border-line/80 bg-white text-ink/60 hover:bg-mist",
                    )}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          ) : null}

          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-ink/80">
            <input
              type="checkbox"
              checked={peak}
              onChange={(event) => setPeak(event.target.checked)}
              className="size-4 rounded border-line text-[#2457d6] accent-[#2457d6]"
            />
            During peak hours
          </label>

          <div className="grid grid-cols-3 gap-2">
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
                <button
                  key={slot}
                  type="button"
                  onClick={() => chooseSlot(slot)}
                  aria-pressed={activeSlot}
                  className={cn(
                    "flex min-w-0 items-center gap-2 rounded-2xl border px-2 py-2 text-left transition duration-200",
                    activeSlot
                      ? meta.selected
                      : "border-line/70 bg-white hover:border-line hover:bg-mist/40",
                  )}
                >
                  <Icon
                    className={cn("size-5 shrink-0", activeSlot ? "" : "text-ink/35")}
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block truncate text-[11px] font-semibold leading-tight sm:text-xs",
                        activeSlot ? "" : "text-ink/70",
                      )}
                    >
                      {meta.label}
                    </span>
                    <span className="block truncate text-sm font-bold leading-tight tracking-tight">
                      {loading && saveAs === slot
                        ? "…"
                        : seconds != null
                          ? formatDriveDuration(seconds)
                          : place
                            ? "Saved"
                            : "Add"}
                    </span>
                    {place?.distanceMeters != null ? (
                      <span className="block truncate text-[10px] font-medium opacity-70 @min-[40rem]:hidden">
                        {formatDriveDistance(place.distanceMeters)}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2 @min-[40rem]:w-40">
          <div className={cn("relative transition-[height] duration-300", mapExpanded ? "h-64" : "h-36 @min-[40rem]:h-full @min-[40rem]:min-h-40")}>
            <RouteSketch
              dashed={false}
              minutes={shownSeconds != null ? formatDriveDuration(shownSeconds) : null}
            />
            <button
              type="button"
              onClick={() => setMapExpanded((open) => !open)}
              aria-label={mapExpanded ? "Shrink map" : "Expand map"}
              className="absolute bottom-2 right-2 flex size-8 items-center justify-center rounded-lg border border-line/70 bg-white/95 text-ink/70 shadow-sm transition hover:text-ink @min-[40rem]:hidden"
            >
              <Maximize2 className="size-3.5" aria-hidden />
            </button>
          </div>
          <a
            href={mapsHref(originLat, originLng, active)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-1 py-1 text-sm font-semibold text-[#2457d6] transition hover:text-[#1d4ed8] @min-[40rem]:hidden"
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
