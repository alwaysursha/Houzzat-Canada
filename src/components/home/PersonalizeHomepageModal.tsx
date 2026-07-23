"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  propertyTypeLabel,
} from "@/lib/listings/constants";
import type { PropertyType } from "@prisma/client";
import { cn } from "@/lib/utils";

const RESIDENTIAL_TYPES: PropertyType[] = [
  "DETACHED",
  "SEMI_DETACHED",
  "TOWNHOUSE",
  "CONDO_APT",
  "CONDO_TOWNHOUSE",
  "MULTIPLEX",
  "VACANT_LAND",
  "OTHER",
];

const COMMERCIAL_TYPES: PropertyType[] = [
  "OFFICE",
  "RETAIL",
  "INDUSTRIAL",
  "MIXED_USE",
  "OTHER",
];

export function PersonalizeHomepageModal({
  open,
  onClose,
  cities,
  initial,
  searchId,
}: {
  open: boolean;
  onClose: () => void;
  cities: string[];
  searchId?: string;
  initial?: {
    name?: string;
    minPrice?: string;
    maxPrice?: string;
    propertyTypes?: string[];
    city?: string;
    communities?: string[];
  };
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "My homepage search");
  const [minPrice, setMinPrice] = useState(initial?.minPrice ?? "");
  const [maxPrice, setMaxPrice] = useState(initial?.maxPrice ?? "");
  const [propertyTypes, setPropertyTypes] = useState<string[]>(
    initial?.propertyTypes ?? [],
  );
  const [city, setCity] = useState(initial?.city ?? "");
  const [communities, setCommunities] = useState<string[]>(
    initial?.communities ?? [],
  );
  const [communityQuery, setCommunityQuery] = useState("");
  const [communitySuggestions, setCommunitySuggestions] = useState<string[]>(
    [],
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "My homepage search");
    setMinPrice(initial?.minPrice ?? "");
    setMaxPrice(initial?.maxPrice ?? "");
    setPropertyTypes(initial?.propertyTypes ?? []);
    setCity(initial?.city ?? "");
    setCommunities(initial?.communities ?? []);
    setCommunityQuery("");
    setError(null);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  const loadCommunities = useCallback(
    async (q: string) => {
      if (q.trim().length < 1) {
        setCommunitySuggestions([]);
        return;
      }
      const params = new URLSearchParams({ q: q.trim() });
      if (city) params.set("city", city);
      const res = await fetch(`/api/listings/communities?${params}`);
      if (!res.ok) return;
      const data = (await res.json()) as { items?: string[] };
      setCommunitySuggestions(
        (data.items ?? []).filter((item) => !communities.includes(item)),
      );
    },
    [city, communities],
  );

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      void loadCommunities(communityQuery);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [communityQuery, loadCommunities, open]);

  const typeGroups = useMemo(
    () => [
      { label: "Residential", types: RESIDENTIAL_TYPES },
      { label: "Commercial", types: COMMERCIAL_TYPES },
    ],
    [],
  );

  function toggleType(type: PropertyType) {
    setPropertyTypes((current) =>
      current.includes(type)
        ? current.filter((t) => t !== type)
        : [...current, type],
    );
  }

  function addCommunity(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setCommunities((current) =>
      current.includes(trimmed) ? current : [...current, trimmed],
    );
    setCommunityQuery("");
    setCommunitySuggestions([]);
  }

  async function onSave() {
    setPending(true);
    setError(null);
    const query = {
      ...(minPrice.trim() ? { minPrice: minPrice.trim() } : {}),
      ...(maxPrice.trim() ? { maxPrice: maxPrice.trim() } : {}),
      ...(propertyTypes.length ? { propertyTypes } : {}),
      ...(city.trim() ? { city: city.trim() } : {}),
      ...(communities.length ? { communities } : {}),
    };

    const res = searchId
      ? await fetch("/api/saved-searches", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: searchId,
            name: name.trim() || "My homepage search",
            query,
            isHomepageActive: true,
          }),
        })
      : await fetch("/api/saved-searches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim() || "My homepage search",
            query,
            applyToHomepage: true,
          }),
        });
    setPending(false);
    if (!res.ok) {
      setError("Could not save your search. Try again.");
      return;
    }
    window.dispatchEvent(new Event("houzzat:saved-searches-changed"));
    window.dispatchEvent(new Event("houzzat:homepage-personalization-changed"));
    onClose();
    router.refresh();
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="personalize-home-title"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/55 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-line bg-surface shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-surface/95 px-5 py-4 backdrop-blur">
          <div>
            <p
              id="personalize-home-title"
              className="font-display text-2xl text-ink"
            >
              Personalized listings
            </p>
            <p className="mt-1 text-sm text-ink/55">
              Save a search and apply it to your homepage. You can create more
              later from your account.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-ink/50 transition hover:bg-mist hover:text-ink"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="space-y-5 px-5 py-5">
          <label className="block space-y-1.5 text-xs font-semibold uppercase tracking-wide text-ink/50">
            Search name
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cambridge under 800k"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-ink/50">
              Min price
              <Input
                inputMode="numeric"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="500000"
              />
            </label>
            <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-ink/50">
              Max price
              <Input
                inputMode="numeric"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="900000"
              />
            </label>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-ink/50">
              Property type
            </legend>
            {typeGroups.map((group) => (
              <div key={group.label} className="space-y-2">
                <p className="text-xs font-medium text-ink/40">{group.label}</p>
                <div className="flex flex-wrap gap-2">
                  {group.types.map((type) => {
                    const active = propertyTypes.includes(type);
                    return (
                      <button
                        key={`${group.label}-${type}`}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleType(type)}
                        className={cn(
                          "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                          active
                            ? "bg-ink text-white"
                            : "border border-line bg-mist/60 text-ink/70 hover:border-canopy/40",
                        )}
                      >
                        {propertyTypeLabel(type)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-ink/50">
              City
            </legend>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={!city}
                onClick={() => setCity("")}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                  !city
                    ? "bg-canopy text-white"
                    : "border border-line text-ink/70 hover:border-canopy/40",
                )}
              >
                Any city
              </button>
              {cities.map((option) => {
                const active = city === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCity(option)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                      active
                        ? "bg-canopy text-white"
                        : "border border-line text-ink/70 hover:border-canopy/40",
                    )}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-ink/50">
              Communities
            </label>
            <p className="text-xs text-ink/45">
              Type to search and add one or more communities.
            </p>
            {communities.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {communities.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() =>
                      setCommunities((current) =>
                        current.filter((c) => c !== item),
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-full border border-canopy/30 bg-canopy/10 px-3 py-1 text-xs font-semibold text-canopy-deep"
                  >
                    {item}
                    <X className="size-3" aria-hidden />
                  </button>
                ))}
              </div>
            ) : null}
            <div className="relative">
              <Input
                value={communityQuery}
                onChange={(e) => setCommunityQuery(e.target.value)}
                placeholder="e.g. Preston, Hespeler…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (communitySuggestions[0]) {
                      addCommunity(communitySuggestions[0]);
                    } else if (communityQuery.trim()) {
                      addCommunity(communityQuery);
                    }
                  }
                }}
              />
              {communitySuggestions.length > 0 ? (
                <ul className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
                  {communitySuggestions.map((suggestion) => (
                    <li key={suggestion}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-mist"
                        onClick={() => addCommunity(suggestion)}
                      >
                        {suggestion}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          {error ? (
            <p className="text-sm font-medium text-danger">{error}</p>
          ) : null}
        </div>

        <footer className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface/95 px-5 py-4 backdrop-blur">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={() => void onSave()}>
            {pending ? "Saving…" : "Save & Apply"}
          </Button>
        </footer>
      </div>
    </div>
  );
}
