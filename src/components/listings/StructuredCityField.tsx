"use client";

import {
  forwardRef,
  useImperativeHandle,
  useState,
} from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { withStructuredCity } from "@/lib/listings/structured-cities";
import { cn } from "@/lib/utils";

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
    /** Touch-friendlier chips/input for the mobile Filters sheet. */
    presentation?: "default" | "sheet";
  }
>(function StructuredCityField(
  { cities, onCitiesChange, presentation = "default" },
  ref,
) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const sheet = presentation === "sheet";

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
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink/45">
          City
        </span>
        {cities.length > 0 ? (
          <span className="text-[11px] font-medium tabular-nums text-ink/40">
            {cities.length} selected
          </span>
        ) : null}
      </div>
      {cities.length > 0 ? (
        <div
          className={cn(
            "flex min-w-0 flex-wrap content-start gap-1.5",
            sheet &&
              "gap-2 rounded-2xl border border-canopy/15 bg-canopy/[0.04] p-2.5",
          )}
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
              className={cn(
                "group inline-flex max-w-full items-center gap-1 rounded-full border border-canopy/30 bg-canopy/[0.08] py-0 text-xs font-semibold text-canopy transition hover:border-canopy/50 hover:bg-canopy/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy/35",
                sheet
                  ? "h-10 max-w-full pl-3.5 pr-1.5 text-sm"
                  : "h-8 max-w-full pl-2.5 pr-1 sm:pl-3 sm:pr-1.5",
              )}
            >
              <span className="min-w-0 max-w-full truncate">{city}</span>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center justify-center rounded-full text-canopy/70 transition group-hover:bg-canopy/15 group-hover:text-canopy",
                  sheet ? "size-8" : "size-6",
                )}
              >
                <X className={sheet ? "size-4" : "size-3.5"} aria-hidden />
              </span>
              <span className="sr-only">Remove {city}</span>
            </button>
          ))}
        </div>
      ) : sheet ? (
        <p className="text-xs leading-relaxed text-ink/45">
          Add one or more cities. You can remove any city before applying.
        </p>
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
        className={cn(
          "min-w-0 border-line/80 shadow-none focus-visible:border-canopy/40 focus-visible:ring-canopy/15",
          sheet ? "h-11 rounded-xl px-3.5 text-base" : "h-9",
        )}
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
