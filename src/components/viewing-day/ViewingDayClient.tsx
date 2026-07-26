"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  GripVertical,
  Loader2,
  Printer,
  Share2,
  Trash2,
} from "lucide-react";
import { AddressAutocomplete } from "@/components/listings/AddressAutocomplete";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { Button } from "@/components/ui/button";
import { ViewingDayMap } from "@/components/viewing-day/ViewingDayMap";
import {
  patchLocalViewingDayStart,
  useViewingDay,
} from "@/components/viewing-day/ViewingDayProvider";
import { formatListPrice } from "@/lib/listings/constants";
import {
  loadLocalViewingDay,
  saveLocalViewingDay,
} from "@/lib/viewing-day/local";
import type { AutocompleteSuggestion } from "@/lib/listings/types";
import { cn } from "@/lib/utils";

type TourStop = {
  id: string;
  mlsNumber: string;
  sortOrder: number;
  locked: boolean;
  dwellMinutes: number | null;
  driveFromPrevSeconds: number | null;
  driveFromPrevMeters: number | null;
  suggestedArriveAt: string | null;
  suggestedLeaveAt: string | null;
  listing: {
    mlsNumber: string;
    addressLine: string;
    unitNumber: string | null;
    city: string;
    listPrice: number;
    status: string;
    primaryImageUrl: string | null;
    beds: number;
    baths: number;
    lat: number;
    lng: number;
  } | null;
};

type TourPayload = {
  id: string;
  name: string;
  status: string;
  startAddress: string | null;
  startLat: number | null;
  startLng: number | null;
  startAt: string | null;
  defaultDwellMinutes: number;
  bufferMinutes: number;
  shareToken: string | null;
  requestedAt: string | null;
  stopCount: number;
  stops: TourStop[];
};

function formatClock(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDrive(seconds: number | null) {
  if (seconds == null) return null;
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min drive`;
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${h} hr drive` : `${h} hr ${rem} min drive`;
}

function toDatetimeLocalValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function ViewingDayClient({
  readOnly = false,
  initialTour = null,
  shareMode = false,
}: {
  readOnly?: boolean;
  initialTour?: TourPayload | null;
  shareMode?: boolean;
}) {
  const { status } = useSession();
  const { openAuth } = useAuthModal();
  const { toast } = useSiteAlert();
  const viewingDay = useViewingDay();
  const [tour, setTour] = useState<TourPayload | null>(initialTour);
  const [loading, setLoading] = useState(!initialTour);
  const [saving, setSaving] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [consent, setConsent] = useState(false);
  const [requestNotes, setRequestNotes] = useState("");
  const [polylines, setPolylines] = useState<string[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const loadTour = useCallback(async () => {
    if (shareMode && initialTour) {
      setTour(initialTour);
      setLoading(false);
      return;
    }

    if (status === "loading") return;

    if (status !== "authenticated") {
      const local = loadLocalViewingDay();
      if (local.mlsNumbers.length === 0) {
        setTour({
          id: "local",
          name: "Viewing day",
          status: "DRAFT",
          startAddress: local.startAddress ?? null,
          startLat: local.startLat ?? null,
          startLng: local.startLng ?? null,
          startAt: local.startAt ?? null,
          defaultDwellMinutes: local.defaultDwellMinutes ?? 30,
          bufferMinutes: local.bufferMinutes ?? 5,
          shareToken: null,
          requestedAt: null,
          stopCount: 0,
          stops: [],
        });
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(
          `/api/listings/by-mls?ids=${encodeURIComponent(local.mlsNumbers.join(","))}`,
        );
        const data = (await res.json()) as {
          items?: Array<{
            mlsNumber: string;
            addressLine: string;
            unitNumber: string | null;
            city: string;
            listPrice: number;
            status: string;
            primaryImageUrl: string | null;
            beds: number;
            baths: number;
            lat: number;
            lng: number;
          }>;
        };
        const byMls = new Map((data.items ?? []).map((i) => [i.mlsNumber, i]));
        setTour({
          id: "local",
          name: "Viewing day",
          status: "DRAFT",
          startAddress: local.startAddress ?? null,
          startLat: local.startLat ?? null,
          startLng: local.startLng ?? null,
          startAt: local.startAt ?? null,
          defaultDwellMinutes: local.defaultDwellMinutes ?? 30,
          bufferMinutes: local.bufferMinutes ?? 5,
          shareToken: null,
          requestedAt: null,
          stopCount: local.mlsNumbers.length,
          stops: local.mlsNumbers.map((mls, index) => {
            const listing = byMls.get(mls) ?? null;
            return {
              id: `local-${mls}`,
              mlsNumber: mls,
              sortOrder: index,
              locked: false,
              dwellMinutes: null,
              driveFromPrevSeconds: null,
              driveFromPrevMeters: null,
              suggestedArriveAt: null,
              suggestedLeaveAt: null,
              listing,
            };
          }),
        });
      } catch {
        setTour(null);
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const res = await fetch("/api/viewing-day");
      const data = (await res.json()) as { tour?: TourPayload; error?: string };
      if (!res.ok || !data.tour) {
        toast({ message: data.error ?? "Could not load Viewing day.", tone: "error" });
        return;
      }
      setTour(data.tour);
    } catch {
      toast({ message: "Could not load Viewing day.", tone: "error" });
    } finally {
      setLoading(false);
    }
  }, [status, shareMode, initialTour, toast]);

  useEffect(() => {
    void loadTour();
  }, [loadTour]);

  const mapPoints = useMemo(() => {
    if (!tour) return [];
    const points: Array<{ lat: number; lng: number; label: string }> = [];
    if (tour.startLat != null && tour.startLng != null) {
      points.push({
        lat: tour.startLat,
        lng: tour.startLng,
        label: tour.startAddress ?? "Start",
      });
    }
    for (const stop of tour.stops) {
      if (!stop.listing) continue;
      points.push({
        lat: stop.listing.lat,
        lng: stop.listing.lng,
        label: stop.listing.addressLine,
      });
    }
    return points;
  }, [tour]);

  const loadGeometry = useCallback(async () => {
    if (!tour || tour.stops.length === 0) {
      setPolylines([]);
      return;
    }
    if (tour.startLat == null) {
      setPolylines([]);
      return;
    }

    try {
      if (shareMode && tour.shareToken) {
        const res = await fetch(`/api/viewing-day/share/${tour.shareToken}`, {
          method: "POST",
        });
        const data = (await res.json()) as { polylines?: string[] };
        setPolylines(data.polylines ?? []);
        return;
      }
      if (status !== "authenticated" || tour.id === "local") {
        setPolylines([]);
        return;
      }
      const res = await fetch("/api/viewing-day/route-geometry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includePolyline: true }),
      });
      const data = (await res.json()) as { polylines?: string[] };
      setPolylines(data.polylines ?? []);
    } catch {
      setPolylines([]);
    }
  }, [tour, status, shareMode]);

  useEffect(() => {
    void loadGeometry();
  }, [loadGeometry]);

  async function saveStartFields(next: Partial<TourPayload>) {
    if (!tour || readOnly) return;
    const merged = { ...tour, ...next };
    setTour(merged);

    if (status !== "authenticated") {
      patchLocalViewingDayStart({
        startAddress: merged.startAddress,
        startLat: merged.startLat,
        startLng: merged.startLng,
        startAt: merged.startAt,
        defaultDwellMinutes: merged.defaultDwellMinutes,
        bufferMinutes: merged.bufferMinutes,
        mlsNumbers: merged.stops.map((s) => s.mlsNumber),
      });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/viewing-day", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startAddress: merged.startAddress,
          startLat: merged.startLat,
          startLng: merged.startLng,
          startAt: merged.startAt,
          defaultDwellMinutes: merged.defaultDwellMinutes,
          bufferMinutes: merged.bufferMinutes,
        }),
      });
      const data = (await res.json()) as { tour?: TourPayload; error?: string };
      if (!res.ok || !data.tour) {
        toast({ message: data.error ?? "Could not save.", tone: "error" });
        return;
      }
      setTour(data.tour);
    } finally {
      setSaving(false);
    }
  }

  async function onRebuild(reorder: boolean) {
    if (status !== "authenticated") {
      openAuth({ mode: "sign-in", callbackUrl: "/viewing-day" });
      return;
    }
    setOptimizing(true);
    try {
      const res = await fetch("/api/viewing-day/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reorder }),
      });
      const data = (await res.json()) as { tour?: TourPayload; error?: string };
      if (!res.ok || !data.tour) {
        toast({ message: data.error ?? "Could not build route.", tone: "error" });
        return;
      }
      setTour(data.tour);
      toast({
        message: reorder ? "Route rebuilt and ordered." : "Times updated for current order.",
        tone: "success",
      });
      void loadGeometry();
    } finally {
      setOptimizing(false);
    }
  }

  async function removeStop(mlsNumber: string) {
    if (readOnly) return;
    if (status !== "authenticated") {
      const local = loadLocalViewingDay();
      local.mlsNumbers = local.mlsNumbers.filter((m) => m !== mlsNumber);
      saveLocalViewingDay(local);
      viewingDay?.refresh();
      await loadTour();
      return;
    }
    const res = await fetch("/api/viewing-day/stops", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mlsNumber }),
    });
    const data = (await res.json()) as { tour?: TourPayload; error?: string };
    if (!res.ok || !data.tour) {
      toast({ message: data.error ?? "Could not remove.", tone: "error" });
      return;
    }
    setTour(data.tour);
    window.dispatchEvent(new Event("houzzat:viewing-day-changed"));
  }

  async function onDropReorder(toIndex: number) {
    if (dragIndex == null || !tour || dragIndex === toIndex || readOnly) return;
    const nextStops = [...tour.stops];
    const [moved] = nextStops.splice(dragIndex, 1);
    if (!moved) return;
    nextStops.splice(toIndex, 0, moved);
    setDragIndex(null);
    setTour({ ...tour, stops: nextStops.map((s, i) => ({ ...s, sortOrder: i })) });

    if (status !== "authenticated") {
      saveLocalViewingDay({
        ...loadLocalViewingDay(),
        mlsNumbers: nextStops.map((s) => s.mlsNumber),
      });
      return;
    }

    const res = await fetch("/api/viewing-day/stops", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderedMlsNumbers: nextStops.map((s) => s.mlsNumber),
      }),
    });
    const data = (await res.json()) as { tour?: TourPayload; error?: string };
    if (!res.ok || !data.tour) {
      toast({ message: data.error ?? "Could not reorder.", tone: "error" });
      await loadTour();
      return;
    }
    setTour(data.tour);
  }

  async function onShare() {
    if (status !== "authenticated") {
      openAuth({ mode: "sign-in", callbackUrl: "/viewing-day" });
      return;
    }
    const res = await fetch("/api/viewing-day/share", { method: "POST" });
    const data = (await res.json()) as {
      path?: string;
      error?: string;
      tour?: TourPayload;
    };
    if (!res.ok || !data.path) {
      toast({ message: data.error ?? "Could not create share link.", tone: "error" });
      return;
    }
    if (data.tour) setTour(data.tour);
    const url = `${window.location.origin}${data.path}`;
    const text = `My Houzzat Viewing day itinerary:\n${url}`;
    if (navigator.share) {
      await navigator.share({ title: "Viewing day", text, url }).catch(() => undefined);
    } else {
      await navigator.clipboard.writeText(url);
      toast({ message: "Share link copied.", tone: "success" });
    }
    const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(wa, "_blank", "noopener,noreferrer");
  }

  async function onRequest() {
    if (status !== "authenticated") {
      openAuth({ mode: "sign-in", callbackUrl: "/viewing-day" });
      return;
    }
    if (!consent) {
      toast({
        message: "Please agree to be contacted by a Houzzat agent.",
        tone: "info",
      });
      return;
    }
    setRequesting(true);
    try {
      const res = await fetch("/api/viewing-day/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactConsent: true, notes: requestNotes || undefined }),
      });
      const data = (await res.json()) as { tour?: TourPayload; error?: string };
      if (!res.ok) {
        toast({ message: data.error ?? "Could not send request.", tone: "error" });
        return;
      }
      if (data.tour) setTour(data.tour);
      toast({
        message: "Viewing day sent to your agent. They’ll confirm times.",
        tone: "success",
      });
    } finally {
      setRequesting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink/55">
        <Loader2 className="size-4 animate-spin" />
        Loading Viewing day…
      </div>
    );
  }

  if (!tour) {
    return (
      <p className="text-sm text-ink/60">Could not load your Viewing day.</p>
    );
  }

  const dateLabel = tour.startAt
    ? new Date(tour.startAt).toLocaleDateString("en-CA", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "Pick a start time";

  return (
    <div className="space-y-8 print:space-y-4">
      <header className="space-y-1">
        <h1 className="font-display text-3xl text-ink">Viewing day</h1>
        <p className="text-sm text-ink/55">
          {dateLabel} · Suggested times
          {tour.status === "REQUESTED" ? " · Requested" : ""}
        </p>
        <p className="text-xs text-ink/45">
          Times are suggested for planning. Confirm with your agent before going.
        </p>
      </header>

      {!readOnly ? (
        <section className="space-y-3 rounded-xl border border-line bg-surface p-4 print:border-0 print:p-0">
          <h2 className="text-sm font-semibold text-ink">Start from</h2>
          <AddressAutocomplete
            fillOnly
            source="google"
            minChars={2}
            placeholder="Your start address"
            initialQuery={tour.startAddress ?? ""}
            onPlaceSelect={(place: AutocompleteSuggestion) => {
              void saveStartFields({
                startAddress:
                  place.city && place.province
                    ? `${place.label}, ${place.city}, ${place.province}`
                    : place.label,
                startLat: place.lat ?? null,
                startLng: place.lng ?? null,
              });
            }}
          />
          <label className="block text-sm text-ink/70">
            First viewing
            <input
              type="datetime-local"
              className="mt-1 h-11 w-full rounded-md border border-line bg-mist px-3 text-ink"
              value={toDatetimeLocalValue(tour.startAt)}
              onChange={(e) => {
                void saveStartFields({
                  startAt: fromDatetimeLocalValue(e.target.value),
                });
              }}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="text-sm text-ink/70">
              Dwell (min)
              <input
                type="number"
                min={10}
                max={180}
                className="ml-2 h-9 w-20 rounded-md border border-line bg-mist px-2"
                value={tour.defaultDwellMinutes}
                onChange={(e) => {
                  void saveStartFields({
                    defaultDwellMinutes: Number(e.target.value) || 30,
                  });
                }}
              />
            </label>
            <label className="text-sm text-ink/70">
              Buffer (min)
              <input
                type="number"
                min={0}
                max={60}
                className="ml-2 h-9 w-20 rounded-md border border-line bg-mist px-2"
                value={tour.bufferMinutes}
                onChange={(e) => {
                  void saveStartFields({
                    bufferMinutes: Number(e.target.value) || 0,
                  });
                }}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={optimizing || saving}
              onClick={() => void onRebuild(true)}
            >
              {optimizing ? "Building…" : "Rebuild route"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={optimizing || saving}
              onClick={() => void onRebuild(false)}
            >
              Update times only
            </Button>
          </div>
        </section>
      ) : tour.startAddress ? (
        <p className="text-sm text-ink/65">
          Start: {tour.startAddress}
          {tour.startAt ? ` · ${formatClock(tour.startAt)}` : ""}
        </p>
      ) : null}

      {tour.stops.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface/60 px-4 py-10 text-center">
          <p className="text-sm text-ink/60">
            Add homes from search or listing pages — then set where you’ll start.
          </p>
          <Link
            href="/search?transactionType=SALE"
            className="mt-3 inline-block text-sm font-semibold text-canopy hover:underline"
          >
            Browse listings →
          </Link>
        </div>
      ) : (
        <ol className="space-y-3">
          {tour.stops.map((stop, index) => (
            <li key={stop.id}>
              {index > 0 && stop.driveFromPrevSeconds != null ? (
                <p className="mb-1 pl-10 text-xs font-medium text-canopy">
                  ↑ {formatDrive(stop.driveFromPrevSeconds)}
                </p>
              ) : null}
              <div
                className={cn(
                  "flex gap-3 rounded-xl border border-line bg-surface p-3",
                  !readOnly && "cursor-grab active:cursor-grabbing",
                )}
                draggable={!readOnly}
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => void onDropReorder(index)}
              >
                {!readOnly ? (
                  <span className="mt-2 text-ink/35">
                    <GripVertical className="size-4" />
                  </span>
                ) : null}
                <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-canopy text-xs font-bold text-white">
                  {index + 1}
                </span>
                {stop.listing?.primaryImageUrl ? (
                  <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-md bg-mist">
                    <Image
                      src={stop.listing.primaryImageUrl}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  </div>
                ) : (
                  <div className="h-16 w-20 shrink-0 rounded-md bg-mist" />
                )}
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/listing/${stop.mlsNumber}`}
                    className="font-medium text-ink hover:text-canopy"
                  >
                    {stop.listing
                      ? [
                          stop.listing.unitNumber
                            ? `${stop.listing.unitNumber} – ${stop.listing.addressLine}`
                            : stop.listing.addressLine,
                          stop.listing.city,
                        ].join(", ")
                      : `MLS® ${stop.mlsNumber}`}
                  </Link>
                  <p className="text-sm text-ink/55">
                    {stop.listing
                      ? `${formatListPrice(stop.listing.listPrice)} · ${stop.listing.beds} bd · ${stop.listing.baths} ba`
                      : null}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {formatClock(stop.suggestedArriveAt)}
                    {" – "}
                    {formatClock(stop.suggestedLeaveAt)}
                  </p>
                </div>
                {!readOnly ? (
                  <button
                    type="button"
                    aria-label="Remove stop"
                    className="mt-1 self-start rounded-md p-1.5 text-ink/40 hover:bg-mist hover:text-danger"
                    onClick={() => void removeStop(stop.mlsNumber)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}

      {mapPoints.length > 0 ? (
        <section className="space-y-2 print:hidden">
          <h2 className="font-display text-xl text-ink">Route map</h2>
          <ViewingDayMap points={mapPoints} polylines={polylines} />
        </section>
      ) : null}

      {!readOnly && !shareMode ? (
        <section className="space-y-4 rounded-xl border border-line bg-surface p-4 print:hidden">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void onShare()}
              disabled={tour.stops.length === 0}
            >
              <Share2 className="size-4" />
              Share
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => window.print()}
              disabled={tour.stops.length === 0}
            >
              <Printer className="size-4" />
              Print / PDF
            </Button>
          </div>

          <div className="space-y-3 border-t border-line pt-4">
            <h2 className="font-semibold text-ink">Request this tour</h2>
            <p className="text-sm text-ink/60">
              Send the suggested itinerary to a Houzzat agent to confirm showings.
            </p>
            <textarea
              className="min-h-[4.5rem] w-full rounded-md border border-line bg-mist px-3 py-2 text-sm"
              placeholder="Optional notes for your agent"
              value={requestNotes}
              onChange={(e) => setRequestNotes(e.target.value)}
            />
            <label className="flex items-start gap-2 text-sm text-ink/70">
              <input
                type="checkbox"
                className="mt-1"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              I agree to be contacted by a Houzzat agent about this Viewing day.
            </label>
            <Button
              type="button"
              disabled={requesting || tour.stops.length === 0}
              onClick={() => void onRequest()}
            >
              {requesting ? "Sending…" : "Request this tour"}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
