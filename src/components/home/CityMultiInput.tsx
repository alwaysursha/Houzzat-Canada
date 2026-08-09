"use client";

import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Suggestion = {
  label: string;
  type?: string;
  group?: string;
};

export function CityMultiInput({
  cities,
  onChange,
  placeholder = "Type a city and press Enter",
  className,
}: {
  cities: string[];
  onChange: (cities: string[]) => void;
  placeholder?: string;
  className?: string;
}) {
  const listId = useId();
  const [draft, setDraft] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    const q = draft.trim();
    if (q.length < 1) {
      setSuggestions([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/listings/autocomplete?q=${encodeURIComponent(q)}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as { suggestions?: Suggestion[] };
        const next = (data.suggestions ?? [])
          .filter(
            (s) =>
              s.type === "city" ||
              s.group === "cities" ||
              s.group === "city_search",
          )
          .map((s) => s.label.trim())
          .filter(
            (label) =>
              label &&
              !cities.some((c) => c.toLowerCase() === label.toLowerCase()),
          );
        setSuggestions([...new Set(next)].slice(0, 8));
      } catch {
        setSuggestions([]);
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [draft, cities]);

  function addCity(value: string) {
    const trimmed = value.trim().replace(/,$/, "");
    if (!trimmed) return;
    if (cities.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setDraft("");
      setSuggestions([]);
      return;
    }
    onChange([...cities, trimmed]);
    setDraft("");
    setSuggestions([]);
  }

  function removeCity(value: string) {
    onChange(cities.filter((c) => c !== value));
  }

  return (
    <div className={cn("space-y-2", className)}>
      {cities.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {cities.map((city) => (
            <button
              key={city}
              type="button"
              onClick={() => removeCity(city)}
              className="inline-flex items-center gap-1.5 rounded-full border border-canopy/30 bg-canopy/10 px-3 py-1 text-xs font-semibold text-canopy-deep transition hover:bg-danger/10 hover:text-danger"
            >
              {city}
              <X className="size-3" aria-hidden />
            </button>
          ))}
        </div>
      ) : null}

      <div className="relative">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          aria-autocomplete="list"
          aria-controls={listId}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              if (suggestions[0]) addCity(suggestions[0]);
              else addCity(draft);
            } else if (e.key === "Backspace" && !draft && cities.length) {
              removeCity(cities[cities.length - 1]!);
            }
          }}
        />
        {suggestions.length > 0 ? (
          <ul
            id={listId}
            className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
          >
            {suggestions.map((suggestion) => (
              <li key={suggestion}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-mist"
                  onClick={() => addCity(suggestion)}
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <p className="text-xs text-ink/45">
        Add one or more cities. Press Enter or comma after each city.
      </p>
    </div>
  );
}
