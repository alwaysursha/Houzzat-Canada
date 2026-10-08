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
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-full px-2.5 py-1.5 text-xs font-semibold transition",
            value === opt.value
              ? "bg-canopy text-white"
              : "bg-mist text-ink/70 hover:bg-line/60",
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
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/45">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Persistent left filter rail for desktop card results.
 * Same canonical SearchFilters state as the mobile sheet / toolbar menu.
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
  onChange: (next: SearchFilters) => void;
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
      className="hidden h-full w-[17.5rem] shrink-0 flex-col border-r border-line/70 bg-surface lg:flex xl:w-[19rem]"
      aria-label="Search filters"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line/70 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Filters</p>
          <p className="mt-0.5 text-xs tabular-nums text-ink/45">
            {pending
              ? "Updating…"
              : `${resultCount.toLocaleString("en-CA")} ${resultNoun}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onResetFilters}
          className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-ink/55 transition hover:bg-mist hover:text-danger"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Reset
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4">
        <Section title="Buy / Rent">
          <ChipRow
            value={filters.transactionType}
            options={[
              { value: "SALE", label: "Buy" },
              { value: "LEASE", label: "Rent" },
              { value: "ALL", label: "Both" },
            ]}
            onChange={(v) =>
              onChange({
                ...filters,
                transactionType: v as SearchFilters["transactionType"],
                statuses: ["ACTIVE"],
                openHouseOnly:
                  v === "LEASE" ? false : filters.openHouseOnly,
              })
            }
          />
        </Section>

        <Section title="Residential / Commercial">
          <ChipRow
            value={filters.segment}
            options={[
              { value: "RESIDENTIAL", label: "Residential" },
              { value: "COMMERCIAL", label: "Commercial" },
              { value: "ALL", label: "All" },
            ]}
            onChange={(v) =>
              onChange({
                ...filters,
                segment: v as SearchFilters["segment"],
                minBeds: v === "COMMERCIAL" ? "" : filters.minBeds,
                minBaths: v === "COMMERCIAL" ? "" : filters.minBaths,
                propertyTypes: [],
              })
            }
          />
        </Section>

        <Section title="Location">
          <StructuredCityField cities={cities} onCitiesChange={onCitiesChange} />
          <label className="mt-2 block min-w-0 space-y-1 text-xs font-semibold uppercase tracking-wide text-ink/45">
            Community
            <Input
              value={filters.community}
              onChange={(e) =>
                onChange({ ...filters, community: e.target.value })
              }
              placeholder="The Beaches"
              className="h-9 font-normal normal-case tracking-normal"
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
              onChange({
                ...filters,
                minPrice: min ?? "",
                maxPrice: max ?? "",
              });
            }}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              inputMode="numeric"
              placeholder="Min"
              aria-label="Minimum price"
              value={filters.minPrice}
              onChange={(e) =>
                onChange({
                  ...filters,
                  minPrice: e.target.value.replace(/\D/g, ""),
                })
              }
              className="h-9"
            />
            <Input
              inputMode="numeric"
              placeholder="Max"
              aria-label="Maximum price"
              value={filters.maxPrice}
              onChange={(e) =>
                onChange({
                  ...filters,
                  maxPrice: e.target.value.replace(/\D/g, ""),
                })
              }
              className="h-9"
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
            onChange={(v) => onChange({ ...filters, minBeds: v })}
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
            onChange={(v) => onChange({ ...filters, minBaths: v })}
          />
        </Section>

        <Section title="Property type">
          <div className="flex flex-wrap gap-1.5">
            {typeOptions.map((type) => {
              const selected = filters.propertyTypes.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    const next = selected
                      ? filters.propertyTypes.filter((t) => t !== type)
                      : [...filters.propertyTypes, type];
                    onChange({ ...filters, propertyTypes: next });
                  }}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold transition",
                    selected
                      ? "bg-canopy text-white"
                      : "bg-mist text-ink/70 ring-1 ring-line hover:bg-line/40",
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
