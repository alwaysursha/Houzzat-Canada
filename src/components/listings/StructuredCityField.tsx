"use client";

import {
  forwardRef,
  useImperativeHandle,
  useState,
} from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { withStructuredCity } from "@/lib/listings/structured-cities";

export type StructuredCityFlushResult =
  | { ok: true; cities: string[]; committed: boolean }
  | { ok: false; error: string; draft: string };

export type StructuredCityFieldHandle = {
  /**
   * Resolve typed text into cities. Side-effect free except clearing draft /
   * error UI — callers must apply `cities` via onCitiesChange / Apply.
   */
  flush: () => StructuredCityFlushResult;
};

const UNRECOGNIZED_CITY_MESSAGE =
  "Enter a recognized city and press Enter, or choose from your selected cities. Clear the field to apply without a new city.";

/** Selected cities plus a field that adds another recognized city. */
export const StructuredCityField = forwardRef<
  StructuredCityFieldHandle,
  {
    cities: string[];
    onCitiesChange: (next: string[]) => void;
  }
>(function StructuredCityField({ cities, onCitiesChange }, ref) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function resolveDraft(raw: string): StructuredCityFlushResult {
    const trimmed = raw.trim();
    if (!trimmed) {
      setError(null);
      return { ok: true, cities, committed: false };
    }
    const next = withStructuredCity(cities, trimmed);
    if (!next) {
      const message = UNRECOGNIZED_CITY_MESSAGE;
      setError(message);
      return { ok: false, error: message, draft: trimmed };
    }
    const unchanged =
      next.length === cities.length &&
      next.every((city, index) => city === cities[index]);
    return { ok: true, cities: next, committed: !unchanged };
  }

  useImperativeHandle(ref, () => ({
    flush: () => {
      const result = resolveDraft(draft);
      if (result.ok && result.committed) {
        setDraft("");
        setError(null);
      } else if (result.ok) {
        setError(null);
      }
      return result;
    },
  }));

  function commit() {
    const result = resolveDraft(draft);
    if (!result.ok) return;
    if (result.committed) onCitiesChange(result.cities);
    setDraft("");
    setError(null);
  }

  return (
    <div className="min-w-0 space-y-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink/45">
        City
      </span>
      {cities.length > 0 ? (
        <div
          className="flex min-w-0 flex-wrap content-start gap-1.5"
          role="list"
          aria-label="Selected cities"
        >
          {cities.map((city) => (
            <button
              key={city}
              type="button"
              role="listitem"
              onClick={() =>
                onCitiesChange(cities.filter((selected) => selected !== city))
              }
              className="group inline-flex h-8 max-w-full items-center gap-1 rounded-full border border-canopy/30 bg-canopy/[0.08] py-0 pl-2.5 pr-1 text-xs font-semibold text-canopy transition hover:border-canopy/50 hover:bg-canopy/15 sm:pl-3 sm:pr-1.5"
            >
              <span className="min-w-0 truncate">{city}</span>
              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-canopy/70 transition group-hover:bg-canopy/15 group-hover:text-canopy">
                <X className="size-3.5" aria-hidden />
              </span>
              <span className="sr-only">Remove {city}</span>
            </button>
          ))}
        </div>
      ) : null}
      <Input
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          commit();
        }}
        placeholder={cities.length > 0 ? "Add a city" : "Toronto"}
        aria-label={cities.length > 0 ? "Add a city" : "City"}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "structured-city-error" : undefined}
        className="min-w-0 h-9 border-line/80 shadow-none focus-visible:border-canopy/40 focus-visible:ring-canopy/15"
      />
      {error ? (
        <p
          id="structured-city-error"
          role="alert"
          className="text-xs font-medium text-danger"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
});
