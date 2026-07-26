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
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import { Input } from "@/components/ui/input";
import { RoutePlannerMap } from "@/components/route-planner/RoutePlannerMap";
import {
  patchLocalRoutePlannerStart,
  useRoutePlanner,
} from "@/components/route-planner/RoutePlannerProvider";
import { formatListPrice } from "@/lib/listings/constants";
import {
  loadLocalRoutePlanner,
  saveLocalRoutePlanner,
} from "@/lib/route-planner/local";
import type { AutocompleteSuggestion } from "@/lib/listings/types";
import { cn } from "@/lib/utils";
import {
  buildRoutePlannerExpertWhatsAppUrl,
  getExpertWhatsAppNumber,
} from "@/lib/whatsapp";

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

export function RoutePlannerClient({
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
  const routePlanner = useRoutePlanner();
  const [tour, setTour] = useState<TourPayload | null>(initialTour);
  const [loading, setLoading] = useState(!initialTour);
  const [saving, setSaving] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [bookingMessage, setBookingMessage] = useState("");
  const [polylines, setPolylines] = useState<string[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const expertWhatsApp = useMemo(() => getExpertWhatsAppNumber(), []);

  const loadTour = useCallback(async () => {
    if (shareMode && initialTour) {
      setTour(initialTour);
      setLoading(false);
      return;
    }

    if (status === "loading") return;

    if (status !== "authenticated") {
      const local = loadLocalRoutePlanner();
      if (local.mlsNumbers.length === 0) {
        setTour({
          id: "local",
          name: "Route Planner",
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
          name: "Route Planner",
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
      const res = await fetch("/api/route-planner");
      const data = (await res.json()) as { tour?: TourPayload; error?: string };
      if (!res.ok || !data.tour) {
        toast({ message: data.error ?? "Could not load Route Planner.", tone: "error" });
        return;
      }
      setTour(data.tour);
    } catch {
      toast({ message: "Could not load Route Planner.", tone: "error" });
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
      return;
    }
    if (tour.startLat == null) {
      return;
    }

    try {
      if (shareMode && tour.shareToken) {
        const res = await fetch(`/api/route-planner/share/${tour.shareToken}`, {
          method: "POST",
        });
        const data = (await res.json()) as { polylines?: string[] };
        setPolylines(data.polylines ?? []);
        return;
      }
      if (status !== "authenticated" || tour.id === "local") {
        return;
      }
      const res = await fetch("/api/route-planner/route-geometry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includePolyline: true }),
      });
      const data = (await res.json()) as { polylines?: string[] };
      setPolylines(data.polylines ?? []);
    } catch {
      // Keep previous polylines on failure to avoid a blank flash.
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
      patchLocalRoutePlannerStart({
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
      const res = await fetch("/api/route-planner", {
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
      openAuth({ mode: "sign-in", callbackUrl: "/route-planner" });
      return;
    }
    setOptimizing(true);
    try {
      const res = await fetch("/api/route-planner/optimize", {
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
      // Geometry reloads via the tour-dependent effect — avoid a second fetch.
    } finally {
      setOptimizing(false);
    }
  }

  async function removeStop(mlsNumber: string) {
    if (readOnly) return;
    if (status !== "authenticated") {
      const local = loadLocalRoutePlanner();
      local.mlsNumbers = local.mlsNumbers.filter((m) => m !== mlsNumber);
      saveLocalRoutePlanner(local);
      routePlanner?.refresh();
      await loadTour();
      return;
    }
    const res = await fetch("/api/route-planner/stops", {
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
    window.dispatchEvent(new Event("houzzat:route-planner-changed"));
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
      saveLocalRoutePlanner({
        ...loadLocalRoutePlanner(),
        mlsNumbers: nextStops.map((s) => s.mlsNumber),
      });
      return;
    }

    const res = await fetch("/api/route-planner/stops", {
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
      openAuth({ mode: "sign-in", callbackUrl: "/route-planner" });
      return;
    }
    if (
      !tour?.startAddress?.trim() ||
      tour.startLat == null ||
      tour.startLng == null ||
      !tour.startAt
    ) {
      toast({
        message: "Add your starting location and first viewing time first.",
        tone: "error",
      });
      return;
    }
    const res = await fetch("/api/route-planner/share", { method: "POST" });
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
    const text = `My Houzzat Route Planner itinerary:\n${url}`;
    if (navigator.share) {
      await navigator.share({ title: "Route Planner", text, url }).catch(() => undefined);
    } else {
      await navigator.clipboard.writeText(url);
      toast({ message: "Share link copied.", tone: "success" });
    }
    const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(wa, "_blank", "noopener,noreferrer");
  }

  function onBookViewingsWhatsApp() {
    if (!expertWhatsApp) {
      toast({
        message: "WhatsApp expert number is not configured yet.",
        tone: "error",
      });
      return;
    }
    if (
      !tour?.startAddress?.trim() ||
      tour.startLat == null ||
      tour.startLng == null ||
      !tour.startAt
    ) {
      toast({
        message: "Add your starting location and first viewing time first.",
        tone: "error",
      });
      return;
    }
    if (tour.stops.length === 0) {
      toast({ message: "Add at least one home to book viewings.", tone: "info" });
      return;
    }

    const sharePath = tour.shareToken
      ? `${window.location.origin}/route-planner/share/${tour.shareToken}`
      : null;
    const url = buildRoutePlannerExpertWhatsAppUrl({
      phoneDigits: expertWhatsApp,
      startAddress: tour.startAddress.trim(),
      startAt: tour.startAt,
      stops: tour.stops.map((stop) => ({
        mlsNumber: stop.mlsNumber,
        addressLine: stop.listing?.addressLine ?? `MLS® ${stop.mlsNumber}`,
        city: stop.listing?.city ?? "",
      })),
      message: bookingMessage,
      sharePath,
    });
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-ink/55">
        <Loader2 className="size-4 animate-spin" />
        Loading Route Planner…
      </div>
    );
  }

  if (!tour) {
    return (
      <p className="text-sm text-ink/60">Could not load your Route Planner.</p>
    );
  }

  const dateLabel = tour.startAt
    ? new Date(tour.startAt).toLocaleDateString("en-CA", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "Set a start time";

  const totalDriveMins = tour.stops.reduce((sum, stop, index) => {
    if (index === 0 || stop.driveFromPrevSeconds == null) return sum;
    return sum + Math.max(1, Math.round(stop.driveFromPrevSeconds / 60));
  }, 0);

  const canShareOrPrint =
    status === "authenticated" &&
    Boolean(tour.startAddress?.trim()) &&
    tour.startLat != null &&
    tour.startLng != null &&
    Boolean(tour.startAt);

  const canBookViewings =
    Boolean(expertWhatsApp) &&
    Boolean(tour.startAddress?.trim()) &&
    tour.startLat != null &&
    tour.startLng != null &&
    Boolean(tour.startAt) &&
    tour.stops.length > 0;

  const controls = !readOnly ? (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/45">
          Your location address
        </label>
        <AddressAutocomplete
          fillOnly
          source="google"
          minChars={2}
          placeholder="Your location address"
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
        <p className="text-xs text-ink/45">
          Saved to your profile for future routes.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="block space-y-1.5 text-sm text-ink/70">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/45">
            First Viewing Time
          </span>
          <DateTimePicker
            value={tour.startAt}
            disabled={saving}
            onChange={(nextIso) => {
              void saveStartFields({ startAt: nextIso });
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5 text-sm text-ink/70">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/45">
              Duration
            </span>
            <input
              type="number"
              min={10}
              max={180}
              className="h-11 w-full rounded-md border border-line bg-mist px-3"
              value={tour.defaultDwellMinutes}
              onChange={(e) => {
                void saveStartFields({
                  defaultDwellMinutes: Number(e.target.value) || 30,
                });
              }}
            />
          </label>
          <label className="block space-y-1.5 text-sm text-ink/70">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/45">
              Buffer
            </span>
            <input
              type="number"
              min={0}
              max={60}
              className="h-11 w-full rounded-md border border-line bg-mist px-3"
              value={tour.bufferMinutes}
              onChange={(e) => {
                void saveStartFields({
                  bufferMinutes: Number(e.target.value) || 0,
                });
              }}
            />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={optimizing || saving || tour.stops.length === 0}
          onClick={() => void onRebuild(true)}
        >
          {optimizing ? "Building…" : "Build Route"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={optimizing || saving || tour.stops.length === 0}
          onClick={() => void onRebuild(false)}
        >
          Update times
        </Button>
      </div>
    </div>
  ) : tour.startAddress ? (
    <p className="text-sm text-ink/65">
      From {tour.startAddress}
      {tour.startAt ? ` · ${formatClock(tour.startAt)}` : ""}
    </p>
  ) : null;

  const stopList =
    tour.stops.length === 0 ? (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-mist/50 px-6 py-14 text-center">
        <p className="font-display text-xl text-ink">No stops yet</p>
        <p className="mt-2 max-w-sm text-sm text-ink/55">
          Add homes from search or listing pages, then set your location and
          rebuild the route.
        </p>
        <Link
          href="/search?transactionType=SALE"
          className="mt-5 inline-flex h-11 items-center rounded-lg bg-canopy px-5 text-sm font-semibold text-white transition hover:bg-canopy-deep"
        >
          Browse listings
        </Link>
      </div>
    ) : (
      <ol className="space-y-0">
        {tour.stops.map((stop, index) => (
          <li key={stop.id} className="relative">
            {index > 0 ? (
              <div className="flex items-center gap-3 py-2 pl-5">
                <div className="h-6 w-px bg-canopy/25" aria-hidden />
                <p className="text-xs font-medium text-canopy">
                  {stop.driveFromPrevSeconds != null
                    ? formatDrive(stop.driveFromPrevSeconds)
                    : "Next stop"}
                </p>
              </div>
            ) : null}
            <div
              className={cn(
                "group flex gap-3 rounded-xl border border-line bg-surface p-3 transition hover:border-canopy/35",
                !readOnly && "cursor-grab active:cursor-grabbing",
              )}
              draggable={!readOnly}
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => void onDropReorder(index)}
            >
              {!readOnly ? (
                <span className="mt-3 text-ink/30 group-hover:text-ink/50">
                  <GripVertical className="size-4" />
                </span>
              ) : null}
              <span className="mt-2 flex size-8 shrink-0 items-center justify-center rounded-full bg-canopy text-xs font-bold text-white">
                {index + 1}
              </span>
              {stop.listing?.primaryImageUrl ? (
                <div className="relative hidden h-[4.5rem] w-[5.5rem] shrink-0 overflow-hidden rounded-lg bg-mist sm:block">
                  <Image
                    src={stop.listing.primaryImageUrl}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="88px"
                  />
                </div>
              ) : (
                <div className="hidden h-[4.5rem] w-[5.5rem] shrink-0 rounded-lg bg-mist sm:block" />
              )}
              <div className="min-w-0 flex-1 py-0.5">
                <Link
                  href={`/listing/${stop.mlsNumber}`}
                  className="font-medium text-ink transition hover:text-canopy"
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
                <p className="mt-0.5 text-sm text-ink/55">
                  {stop.listing
                    ? `${formatListPrice(stop.listing.listPrice)} · ${stop.listing.beds} bd · ${stop.listing.baths} ba`
                    : null}
                </p>
                <p className="mt-1.5 text-sm font-semibold tabular-nums text-ink">
                  {formatClock(stop.suggestedArriveAt)}
                  {" – "}
                  {formatClock(stop.suggestedLeaveAt)}
                </p>
              </div>
              {!readOnly ? (
                <button
                  type="button"
                  aria-label="Remove stop"
                  className="mt-1 self-start rounded-md p-1.5 text-ink/35 transition hover:bg-mist hover:text-danger"
                  onClick={() => void removeStop(stop.mlsNumber)}
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    );

  return (
    <div className="space-y-6 print:space-y-4 lg:space-y-8">
      <header className="flex flex-col gap-4 border-b border-line/80 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-canopy">
            Plan your showings
          </p>
          <h1 className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
            Route Planner
          </h1>
          <p className="max-w-xl text-sm text-ink/55">
            {dateLabel}
            {tour.stops.length > 0
              ? ` · ${tour.stops.length} stop${tour.stops.length === 1 ? "" : "s"}`
              : ""}
            {totalDriveMins > 0 ? ` · ~${totalDriveMins} min driving` : ""}
            {tour.status === "REQUESTED" ? " · Requested" : ""}
          </p>
          <p className="text-xs text-ink/40">
            Suggested times only — confirm with your agent before you go.
          </p>
        </div>
        {!readOnly && !shareMode ? (
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void onShare()}
              disabled={!canShareOrPrint}
            >
              <Share2 className="size-4" />
              Share
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => window.print()}
              disabled={!canShareOrPrint}
            >
              <Printer className="size-4" />
              Print
            </Button>
          </div>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.95fr)] lg:items-start xl:grid-cols-[minmax(0,1fr)_minmax(26rem,1fr)]">
        <div className="space-y-6">
          {!readOnly ? (
            <section className="rounded-2xl border border-line bg-surface/90 p-4 shadow-[0_1px_0_rgba(20,32,28,0.04)] sm:p-5">
              {controls}
            </section>
          ) : (
            controls
          )}

          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-xl text-ink">Itinerary</h2>
              {tour.stops.length > 0 ? (
                <p className="text-xs text-ink/45">
                  Drag to reorder
                </p>
              ) : null}
            </div>
            {stopList}
          </section>

          {!readOnly && !shareMode ? (
            <section className="space-y-3 rounded-2xl border border-line bg-surface p-4 sm:p-5 print:hidden">
              <div>
                <h2 className="font-display text-xl text-ink">
                  Book these viewings
                </h2>
                <p className="mt-1 text-sm text-ink/55">
                  Request us on WhatsApp to book the viewings — we include your
                  start point, time, and homes for you.
                </p>
              </div>

              {!expertWhatsApp ? (
                <p className="rounded-xl border border-amber/30 bg-amber/5 px-4 py-3 text-sm text-ink/75">
                  WhatsApp expert number is not configured yet. Set{" "}
                  <code className="text-xs">NEXT_PUBLIC_WHATSAPP_EXPERT</code>{" "}
                  in <code className="text-xs">.env.local</code>, then restart
                  the server.
                </p>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    onBookViewingsWhatsApp();
                  }}
                  className="flex flex-col gap-2 sm:flex-row"
                >
                  <Input
                    placeholder="Any notes for your agent…"
                    value={bookingMessage}
                    onChange={(e) => setBookingMessage(e.target.value)}
                    aria-label="Notes for booking viewings"
                    disabled={!canBookViewings}
                  />
                  <Button
                    type="submit"
                    className="shrink-0 sm:min-w-[11rem]"
                    disabled={!canBookViewings}
                  >
                    Request on WhatsApp
                  </Button>
                </form>
              )}
              {!canBookViewings && expertWhatsApp ? (
                <p className="text-xs text-ink/45">
                  Add your starting location, first viewing time, and at least
                  one home to enable WhatsApp booking.
                </p>
              ) : null}
            </section>
          ) : null}
        </div>

        <aside className="print:hidden lg:sticky lg:top-[calc(var(--site-header-stack)+1rem)]">
          {mapPoints.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-line bg-mist shadow-[0_1px_0_rgba(20,32,28,0.04)]">
              <div className="flex items-center justify-between border-b border-line/80 px-4 py-3">
                <h2 className="text-sm font-semibold text-ink">Route map</h2>
                <p className="text-xs text-ink/45">
                  {mapPoints.length} pin{mapPoints.length === 1 ? "" : "s"}
                </p>
              </div>
              <RoutePlannerMap
                points={mapPoints}
                polylines={polylines}
                className="h-[min(28rem,55vh)] w-full sm:h-[32rem] lg:h-[min(40rem,calc(100vh-12rem))]"
              />
            </div>
          ) : (
            <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-mist/40 px-6 text-center lg:h-[28rem]">
              <p className="text-sm font-medium text-ink/70">Map preview</p>
              <p className="mt-1 max-w-xs text-xs text-ink/45">
                Add your location address and at least one stop to see the route
                on the map.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
