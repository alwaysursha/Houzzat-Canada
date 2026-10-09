"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Plus, X } from "lucide-react";
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

type Suggestion = {
  label: string;
  type?: string;
  group?: string;
};

const UNRECOGNIZED_CITY_MESSAGE =
  "Choose a city from the list. Clear the field to apply without a new city.";

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
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  const sheet = presentation === "sheet";

  useEffect(() => {
    const q = draft.trim();
    if (q.length < 1) {
      setSuggestions([]);
      setHighlight(0);
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
          .filter(Boolean)
          // Only offer names the structured-city catalog will accept.
          .filter((label) => withStructuredCity([], label) != null)
          .filter(
            (label) =>
              !cities.some((c) => c.toLowerCase() === label.toLowerCase()),
          );
        const unique = [...new Set(next)].slice(0, 8);
        setSuggestions(unique);
        setHighlight(0);
        setListOpen(unique.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [draft, cities]);

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
      // Prefer a visible suggestion over raw draft so Apply does not fail
      // when the user typed a prefix but did not tap a row.
      const candidate =
        listOpen && suggestions[highlight]
          ? suggestions[highlight]!
          : suggestions[0] &&
              draft.trim() &&
              suggestions[0]!.toLowerCase().startsWith(draft.trim().toLowerCase())
            ? suggestions[0]!
            : draft;
      const result = resolveDraft(candidate);
      if (result.ok && result.committed) {
        setDraft("");
        setError(null);
        setSuggestions([]);
        setListOpen(false);
      } else if (result.ok) {
        setError(null);
      }
      return result;
    },
  }));

  function selectCity(label: string) {
    const result = resolveDraft(label);
    if (!result.ok) return;
    if (result.committed) onCitiesChange(result.cities);
    setDraft("");
    setError(null);
    setSuggestions([]);
    setListOpen(false);
    setHighlight(0);
    // Keep focus for adding another city.
    inputRef.current?.focus();
  }

  function commitFromKeyboard() {
    if (listOpen && suggestions.length > 0) {
      const pick = suggestions[highlight] ?? suggestions[0]!;
      selectCity(pick);
      return;
    }
    const trimmed = draft.trim();
    if (!trimmed) return;
    const result = resolveDraft(trimmed);
    if (!result.ok) return;
    if (result.committed) onCitiesChange(result.cities);
    setDraft("");
    setError(null);
    setSuggestions([]);
    setListOpen(false);
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
          Type a city, then tap it in the list to add. You can add more than one.
        </p>
      ) : null}

      <div className="relative">
        <Input
          ref={inputRef}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError(null);
            setListOpen(true);
          }}
          onFocus={() => {
            if (suggestions.length > 0) setListOpen(true);
          }}
          onBlur={() => {
            // Allow suggestion tap to register before close.
            window.setTimeout(() => setListOpen(false), 120);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && suggestions.length > 0) {
              event.preventDefault();
              setListOpen(true);
              setHighlight((h) => (h + 1) % suggestions.length);
              return;
            }
            if (event.key === "ArrowUp" && suggestions.length > 0) {
              event.preventDefault();
              setListOpen(true);
              setHighlight(
                (h) => (h - 1 + suggestions.length) % suggestions.length,
              );
              return;
            }
            if (event.key === "Escape") {
              setListOpen(false);
              return;
            }
            if (event.key !== "Enter") return;
            event.preventDefault();
            commitFromKeyboard();
          }}
          placeholder={cities.length > 0 ? "Add another city" : "e.g. Mississauga"}
          aria-label={cities.length > 0 ? "Add another city" : "City"}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={listOpen && suggestions.length > 0}
          aria-activedescendant={
            listOpen && suggestions[highlight]
              ? `${listId}-opt-${highlight}`
              : undefined
          }
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "structured-city-error" : undefined}
          enterKeyHint="done"
          className={cn(
            "min-w-0 border-line/80 shadow-none focus-visible:border-canopy/40 focus-visible:ring-canopy/15",
            sheet ? "h-11 rounded-xl px-3.5 text-base" : "h-9",
          )}
        />
        {listOpen && suggestions.length > 0 ? (
          <ul
            id={listId}
            role="listbox"
            aria-label="City suggestions"
            className={cn(
              "absolute inset-x-0 top-full z-30 mt-1 overflow-hidden border border-line bg-surface shadow-lg",
              sheet ? "rounded-2xl" : "rounded-xl",
            )}
          >
            {suggestions.map((suggestion, index) => (
              <li key={suggestion} role="presentation">
                <button
                  type="button"
                  id={`${listId}-opt-${index}`}
                  role="option"
                  aria-selected={index === highlight}
                  className={cn(
                    "w-full text-left transition",
                    sheet ? "px-3.5 py-3 text-base" : "px-3 py-2 text-sm",
                    index === highlight
                      ? "bg-canopy/[0.1] font-semibold text-canopy-deep"
                      : "hover:bg-mist",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectCity(suggestion)}
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {cities.length > 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.focus()}
          className={cn(
            "inline-flex items-center gap-1.5 font-semibold text-canopy transition hover:text-canopy-deep",
            sheet ? "min-h-10 text-sm" : "text-xs",
          )}
        >
          <Plus className={sheet ? "size-4" : "size-3.5"} aria-hidden />
          Add another city
        </button>
      ) : null}

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
