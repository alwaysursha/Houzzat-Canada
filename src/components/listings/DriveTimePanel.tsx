"use client";

import { useState } from "react";
import { Car } from "lucide-react";
import { AddressAutocomplete } from "@/components/listings/AddressAutocomplete";
import type { AutocompleteSuggestion } from "@/lib/listings/types";

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

type DriveResult = {
  distanceMeters: number;
  durationSeconds: number;
  label: string;
};

export function DriveTimePanel({
  originLat,
  originLng,
}: {
  originLat: number;
  originLng: number;
}) {
  const [destination, setDestination] = useState<AutocompleteSuggestion | null>(
    null,
  );
  const [result, setResult] = useState<DriveResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runDriveCheck(place: AutocompleteSuggestion) {
    if (place.lat == null || place.lng == null) {
      setError("Could not resolve that address. Try another suggestion.");
      setResult(null);
      return;
    }

    setDestination(place);
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/routes/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originLat,
          originLng,
          destLat: place.lat,
          destLng: place.lng,
        }),
      });
      const data = (await res.json()) as {
        distanceMeters?: number;
        durationSeconds?: number;
        error?: string;
      };

      if (!res.ok || data.distanceMeters == null || data.durationSeconds == null) {
        setError(data.error ?? "Could not calculate drive time.");
        return;
      }

      const label =
        place.subtitle ??
        (place.city
          ? `${place.label}, ${place.city}`
          : place.label);

      setResult({
        distanceMeters: data.distanceMeters,
        durationSeconds: data.durationSeconds,
        label,
      });
    } catch {
      setError("Could not calculate drive time. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-mist p-2 text-canopy">
          <Car className="size-5" aria-hidden />
        </div>
        <div>
          <h2 className="font-display text-2xl text-ink">Drive time</h2>
          <p className="mt-1 text-sm text-ink/60">
            Check driving distance and typical travel time from this home to
            work, school etc.
          </p>
        </div>
      </div>

      <AddressAutocomplete
        source="google"
        fillOnly
        placeholder="Enter a workplace, school, or address…"
        onPlaceSelect={(place) => {
          void runDriveCheck(place);
        }}
        onQueryChange={() => {
          setError(null);
          setResult(null);
          setDestination(null);
        }}
      />

      {loading ? (
        <p className="text-sm text-ink/55">Calculating drive time…</p>
      ) : null}

      {error ? <p className="text-sm text-signal">{error}</p> : null}

      {result && !loading ? (
        <div className="rounded-xl border border-line bg-mist/50 px-4 py-3">
          <p className="text-sm text-ink/55">
            To{" "}
            <span className="font-medium text-ink/80">{result.label}</span>
          </p>
          <p className="mt-1 text-lg font-semibold text-ink">
            {formatDriveDistance(result.distanceMeters)}
            <span className="mx-2 text-ink/30">·</span>
            about {formatDriveDuration(result.durationSeconds)} drive
          </p>
          <p className="mt-1 text-xs text-ink/45">
            Typical drive time without live traffic. Actual times vary.
          </p>
        </div>
      ) : null}

      {!result && !loading && !error && destination === null ? (
        <p className="text-xs text-ink/45">
          Pick an address from the suggestions to see distance and drive time.
        </p>
      ) : null}
    </section>
  );
}
