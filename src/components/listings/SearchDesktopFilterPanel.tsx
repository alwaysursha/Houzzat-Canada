"use client";

import type { PropertyType } from "@prisma/client";
import { Check, RotateCcw } from "lucide-react";
import {
  type SearchFilters,
} from "@/components/listings/SearchFilterChips";
import { StructuredCityField } from "@/components/listings/StructuredCityField";
import { Input } from "@/components/ui/input";
import { propertyTypeLabel } from "@/lib/listings/constants";
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

const SALE_PRICE_PRESETS = [
  { label: "Any", min: "", max: "" },
  { label: "Under $750k", min: "", max: "750000" },
  { label: "$750k–$1.2M", min: "750000", max: "1200000" },
  { label: "$1.2M–$2M", min: "1200000", max: "2000000" },
  { label: "$2M+", min: "2000000", max: "" },
];

const LEASE_PRICE_PRESETS = [
  { label: "Any", min: "", max: "" },
  { label: "Under $2.5k", min: "", max: "2500" },
  { label: "$2.5k–$4k", min: "2500", max: "4000" },
  { label: "$4k–$6k", min: "4000", max: "6000" },
  { label: "$6k+", min: "6000", max: "" },
];

function ChipRow({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-full px-2 py-1 text-[11px] font-semibold transition xl:px-2.5 xl:py-1.5 xl:text-xs",
            value === opt.value
              ? "bg-canopy text-white shadow-sm"
              : "bg-mist/90 text-ink/70 ring-1 ring-line/70 hover:bg-line/50 hover:text-ink",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/40 xl:text-[11px]">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Persistent left filter rail for desktop card results.
 * Same canonical SearchFilters state as the mobile sheet / toolbar menu.
 * Buy/Rent lives in the desktop toolbar — not repeated here.
 */
export function SearchDesktopFilterPanel({
  filters,
  onChange,
  cities,
  onCitiesChange,
  onResetFilters,
  resultCount,
  pending,
  resultNoun,
}: {
  filters: SearchFilters;
  onChange: (
    next: SearchFilters | ((current: SearchFilters) => SearchFilters),
  ) => void;
  cities: string[];
  onCitiesChange: (cities: string[]) => void;
  onResetFilters: () => void;
  resultCount: number;
  pending: boolean;
  resultNoun: string;
}) {
  const isLease = filters.transactionType === "LEASE";
  const pricePresets = isLease ? LEASE_PRICE_PRESETS : SALE_PRICE_PRESETS;
  const typeOptions =
    filters.segment === "COMMERCIAL" ? COMMERCIAL_TYPES : RESIDENTIAL_TYPES;

  return (
    <aside
      className="search-desktop-filter-panel hidden h-full w-64 shrink-0 flex-col border-r border-line/60 bg-surface lg:flex"
      aria-label="Search filters"
    >
      <style>{`
        /* Guardrail: Tailwind arbitrary widths were omitted from the CSS bundle,
           which let the sidebar content-size to ~half the stage. */
        aside.search-desktop-filter-panel {
          width: 15.5rem;
          max-width: 18.75rem;
        }
        @media (min-width: 1280px) {
          aside.search-desktop-filter-panel { width: 17rem; }
        }
        @media (min-width: 1440px) {
          aside.search-desktop-filter-panel { width: 18rem; }
        }
      `}</style>
      <div className="relative flex shrink-0 items-center justify-between gap-2 border-b border-line/60 px-4 py-2.5 xl:py-3">
        <div
          className="absolute inset-y-2.5 left-0 w-0.5 rounded-full bg-canopy xl:inset-y-3"
          aria-hidden
        />
        <div className="min-w-0 pl-1">
          <p className="text-sm font-semibold tracking-tight text-ink">Filters</p>
          <p className="mt-0.5 text-[11px] tabular-nums text-ink/45 xl:text-xs">
            {pending
              ? "Updating…"
              : `${resultCount.toLocaleString("en-CA")} ${resultNoun}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onResetFilters}
          className="inline-flex h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold text-ink/50 transition hover:bg-mist hover:text-danger xl:px-2.5"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Reset
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain bg-[linear-gradient(180deg,rgba(238,243,240,0.35)_0%,rgba(255,255,255,0)_6rem)] px-4 py-3.5 xl:space-y-5 xl:py-4">
        <Section title="Residential / Commercial">
          <ChipRow
            value={filters.segment}
            options={[
              { value: "RESIDENTIAL", label: "Residential" },
              { value: "COMMERCIAL", label: "Commercial" },
              { value: "ALL", label: "All" },
            ]}
            onChange={(v) =>
              onChange((current) => ({
                ...current,
                segment: v as SearchFilters["segment"],
                minBeds: v === "COMMERCIAL" ? "" : current.minBeds,
                minBaths: v === "COMMERCIAL" ? "" : current.minBaths,
                propertyTypes: [],
              }))
            }
          />
        </Section>

        <Section title="Location">
          <p className="sr-only">City / Area</p>
          <StructuredCityField cities={cities} onCitiesChange={onCitiesChange} />
          <label className="mt-2 block min-w-0 space-y-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink/40 xl:text-xs">
            Community
            <Input
              value={filters.community}
              onChange={(e) =>
                onChange((current) => ({
                  ...current,
                  community: e.target.value,
                }))
              }
              placeholder="The Beaches"
              className="h-9 border-line/80 bg-surface font-normal normal-case tracking-normal shadow-none focus-visible:border-canopy/40 focus-visible:ring-canopy/15"
            />
          </label>
        </Section>

        <Section title={isLease ? "Monthly rent" : "List price"}>
          <ChipRow
            value={`${filters.minPrice}|${filters.maxPrice}`}
            options={pricePresets.map((p) => ({
              value: `${p.min}|${p.max}`,
              label: p.label,
            }))}
            onChange={(v) => {
              const [min, max] = v.split("|");
              onChange((current) => ({
                ...current,
                minPrice: min ?? "",
                maxPrice: max ?? "",
              }));
            }}
          />
          <div className="grid grid-cols-2 gap-1.5 xl:gap-2">
            <Input
              inputMode="numeric"
              placeholder="Min"
              aria-label="Minimum price"
              value={filters.minPrice}
              onChange={(e) =>
                onChange((current) => ({
                  ...current,
                  minPrice: e.target.value.replace(/\D/g, ""),
                }))
              }
              className="h-9 border-line/80 shadow-none focus-visible:border-canopy/40 focus-visible:ring-canopy/15"
            />
            <Input
              inputMode="numeric"
              placeholder="Max"
              aria-label="Maximum price"
              value={filters.maxPrice}
              onChange={(e) =>
                onChange((current) => ({
                  ...current,
                  maxPrice: e.target.value.replace(/\D/g, ""),
                }))
              }
              className="h-9 border-line/80 shadow-none focus-visible:border-canopy/40 focus-visible:ring-canopy/15"
            />
          </div>
        </Section>

        <Section title="Beds">
          <ChipRow
            value={filters.minBeds || ""}
            options={[
              { value: "", label: "Any" },
              { value: "1", label: "1+" },
              { value: "2", label: "2+" },
              { value: "3", label: "3+" },
              { value: "4", label: "4+" },
              { value: "5", label: "5+" },
            ]}
            onChange={(v) =>
              onChange((current) => ({ ...current, minBeds: v }))
            }
          />
        </Section>

        <Section title="Baths">
          <ChipRow
            value={filters.minBaths || ""}
            options={[
              { value: "", label: "Any" },
              { value: "1", label: "1+" },
              { value: "2", label: "2+" },
              { value: "3", label: "3+" },
              { value: "4", label: "4+" },
            ]}
            onChange={(v) =>
              onChange((current) => ({ ...current, minBaths: v }))
            }
          />
        </Section>

        <Section title="Property type">
          <div className="flex flex-wrap gap-1 xl:gap-1.5">
            {typeOptions.map((type) => {
              const selected = filters.propertyTypes.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    onChange((current) => {
                      const isSelected = current.propertyTypes.includes(type);
                      const next = isSelected
                        ? current.propertyTypes.filter((t) => t !== type)
                        : [...current.propertyTypes, type];
                      return { ...current, propertyTypes: next };
                    });
                  }}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold transition xl:px-2.5 xl:py-1.5 xl:text-xs",
                    selected
                      ? "bg-canopy text-white shadow-sm"
                      : "bg-mist/90 text-ink/70 ring-1 ring-line/70 hover:bg-line/50 hover:text-ink",
                  )}
                >
                  {selected ? (
                    <Check className="size-3" aria-hidden />
                  ) : null}
                  {propertyTypeLabel(type)}
                </button>
              );
            })}
          </div>
        </Section>
      </div>
    </aside>
  );
}
