"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { withStructuredCity } from "@/lib/listings/structured-cities";

/** Selected cities plus a field that adds another recognized city. */
export function StructuredCityField({
  cities,
  onCitiesChange,
}: {
  cities: string[];
  onCitiesChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const next = withStructuredCity(cities, draft);
    if (!next) return;
    const unchanged =
      next.length === cities.length &&
      next.every((city, index) => city === cities[index]);
    if (!unchanged) onCitiesChange(next);
    setDraft("");
  }

  return (
    <div className="min-w-0 space-y-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink/45">
        City
      </span>
      {cities.length > 0 ? (
        <div
          className="flex min-w-0 flex-wrap gap-2"
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
              className="inline-flex h-8 max-w-full items-center gap-1 rounded-full border border-canopy/35 bg-canopy/10 px-3 text-xs font-semibold text-canopy"
            >
              <span className="truncate">{city}</span>
              <X className="size-3.5 shrink-0 opacity-70" aria-hidden />
              <span className="sr-only">Remove {city}</span>
            </button>
          ))}
        </div>
      ) : null}
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          commit();
        }}
        placeholder={cities.length > 0 ? "Add a city" : "Toronto"}
        aria-label={cities.length > 0 ? "Add a city" : "City"}
        className="min-w-0"
      />
    </div>
  );
}
