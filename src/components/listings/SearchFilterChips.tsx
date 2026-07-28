"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PropertyType } from "@prisma/client";
import { Check, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { propertyTypeLabel } from "@/lib/listings/constants";
import { useFlyoutFixedStyle } from "@/lib/use-flyout-fixed-style";
import { cn } from "@/lib/utils";

export type SearchViewMode = "split" | "map" | "cards";

export type SearchStatusOption = "ACTIVE" | "SOLD" | "LEASED" | "UNLISTED";

export type SearchFilters = {
  segment: "RESIDENTIAL" | "COMMERCIAL" | "ALL";
  transactionType: "SALE" | "LEASE" | "ALL";
  dataSource: "fsbo" | "";
  city: string;
  community: string;
  minPrice: string;
  maxPrice: string;
  minBeds: string;
  minBaths: string;
  propertyTypes: PropertyType[];
  openHouseOnly: boolean;
  /** One or more listing statuses (map buttons + chip filter). */
  statuses: SearchStatusOption[];
  sort: "newest" | "price_asc" | "price_desc";
};

export function countActiveSearchFilters(filters: SearchFilters): number {
  let n = 0;
  if (filters.minPrice || filters.maxPrice) n += 1;
  if (filters.minBeds) n += 1;
  if (filters.minBaths) n += 1;
  if (filters.propertyTypes.length > 0) n += 1;
  if (filters.openHouseOnly) n += 1;
  if (filters.city) n += 1;
  if (filters.community) n += 1;
  if (filters.segment !== "RESIDENTIAL") n += 1;
  if (filters.sort !== "newest") n += 1;
  if (
    !(filters.statuses.length === 1 && filters.statuses[0] === "ACTIVE")
  ) {
    n += 1;
  }
  return n;
}

export function resetSearchFilters(filters: SearchFilters): SearchFilters {
  return {
    ...filters,
    segment: "RESIDENTIAL",
    city: "",
    community: "",
    minPrice: "",
    maxPrice: "",
    minBeds: "",
    minBaths: "",
    propertyTypes: [],
    openHouseOnly: false,
    statuses: ["ACTIVE"],
    sort: "newest",
  };
}

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

function FilterPopover({
  label,
  active,
  children,
  wide,
}: {
  label: string;
  active?: boolean;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const menuWidth = wide ? 352 : 224;
  const flyoutStyle = useFlyoutFixedStyle(open, buttonRef, menuWidth);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const panel =
    open && flyoutStyle ? (
      <div
        ref={menuRef}
        role="dialog"
        aria-labelledby={id}
        style={flyoutStyle}
        className="rounded-xl border border-line bg-surface p-3 shadow-lg overflow-y-auto overscroll-contain"
      >
        {children}
        <div className="mt-3 flex justify-end">
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </div>
    ) : null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition",
          active || open
            ? "border-canopy/50 bg-canopy/10 text-canopy"
            : "border-line bg-surface text-ink/75 hover:border-canopy/35",
        )}
      >
        {label}
        <ChevronDown className="size-3.5 opacity-60" aria-hidden />
      </button>
      {mounted && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}

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
            "rounded-full px-3 py-1.5 text-xs font-semibold transition",
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

export function SearchFilterChips({
  filters,
  onChange,
}: {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
}) {
  const isLease = filters.transactionType === "LEASE";
  const pricePresets = isLease ? LEASE_PRICE_PRESETS : SALE_PRICE_PRESETS;
  const typeOptions =
    filters.segment === "COMMERCIAL" ? COMMERCIAL_TYPES : RESIDENTIAL_TYPES;

  const priceLabel =
    filters.minPrice || filters.maxPrice
      ? [
          filters.minPrice
            ? `$${Number(filters.minPrice).toLocaleString("en-CA")}`
            : null,
          filters.maxPrice
            ? `$${Number(filters.maxPrice).toLocaleString("en-CA")}`
            : null,
        ]
          .filter(Boolean)
          .join(" – ")
      : "Price";

  const bedsLabel = filters.minBeds ? `${filters.minBeds}+ bd` : "Beds";
  const bathsLabel = filters.minBaths ? `${filters.minBaths}+ ba` : "Baths";
  const typeLabel =
    filters.propertyTypes.length === 0
      ? "Home type"
      : filters.propertyTypes.length === 1
        ? propertyTypeLabel(filters.propertyTypes[0]!)
        : `${filters.propertyTypes.length} types`;

  const statusOptions: { value: SearchStatusOption; label: string }[] = isLease
    ? [
        { value: "ACTIVE", label: "For lease" },
        { value: "LEASED", label: "Leased" },
        { value: "UNLISTED", label: "Unlisted" },
      ]
    : [
        { value: "ACTIVE", label: "For sale" },
        { value: "SOLD", label: "Sold" },
        { value: "UNLISTED", label: "Unlisted" },
      ];

  const statusLabel =
    filters.statuses.length === 0 ||
    (filters.statuses.length === 1 && filters.statuses[0] === "ACTIVE")
      ? isLease
        ? "For lease"
        : "For sale"
      : filters.statuses.length === statusOptions.length
        ? "Any status"
        : filters.statuses.length === 1
          ? (statusOptions.find((o) => o.value === filters.statuses[0])?.label ??
            "Status")
          : `${filters.statuses.length} statuses`;

  const sortLabel =
    filters.sort === "newest"
      ? "Newest"
      : filters.sort === "price_desc"
        ? "Price ↓"
        : "Price ↑";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterPopover label={priceLabel} active={Boolean(filters.minPrice || filters.maxPrice)} wide>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/45">
          {isLease ? "Monthly rent" : "List price"}
        </p>
        <ChipRow
          value={`${filters.minPrice}|${filters.maxPrice}`}
          options={pricePresets.map((p) => ({
            value: `${p.min}|${p.max}`,
            label: p.label,
          }))}
          onChange={(v) => {
            const [min, max] = v.split("|");
            onChange({ ...filters, minPrice: min ?? "", maxPrice: max ?? "" });
          }}
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Input
            inputMode="numeric"
            placeholder="Min"
            value={filters.minPrice}
            onChange={(e) =>
              onChange({ ...filters, minPrice: e.target.value.replace(/\D/g, "") })
            }
          />
          <Input
            inputMode="numeric"
            placeholder="Max"
            value={filters.maxPrice}
            onChange={(e) =>
              onChange({ ...filters, maxPrice: e.target.value.replace(/\D/g, "") })
            }
          />
        </div>
      </FilterPopover>

      <FilterPopover
        label={bedsLabel}
        active={Boolean(filters.minBeds)}
      >
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
      </FilterPopover>

      <FilterPopover label={bathsLabel} active={Boolean(filters.minBaths)}>
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
      </FilterPopover>

      <FilterPopover
        label={typeLabel}
        active={filters.propertyTypes.length > 0}
        wide
      >
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
                  "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                  selected
                    ? "bg-canopy text-white"
                    : "bg-mist text-ink/70 hover:bg-line/60",
                )}
              >
                {selected ? <Check className="size-3" aria-hidden /> : null}
                {propertyTypeLabel(type)}
              </button>
            );
          })}
        </div>
        {filters.propertyTypes.length > 0 ? (
          <button
            type="button"
            className="mt-2 text-xs font-semibold text-canopy hover:underline"
            onClick={() => onChange({ ...filters, propertyTypes: [] })}
          >
            Clear types
          </button>
        ) : null}
      </FilterPopover>

      <FilterPopover
        label={statusLabel}
        active={
          !(
            filters.statuses.length === 1 && filters.statuses[0] === "ACTIVE"
          ) || filters.openHouseOnly
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {statusOptions.map((opt) => {
            const selected = filters.statuses.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  if (selected) {
                    if (filters.statuses.length === 1) return;
                    onChange({
                      ...filters,
                      statuses: filters.statuses.filter((s) => s !== opt.value),
                    });
                    return;
                  }
                  onChange({
                    ...filters,
                    statuses: [...filters.statuses, opt.value],
                  });
                }}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                  selected
                    ? "bg-canopy text-white"
                    : "bg-mist text-ink/70 hover:bg-line/60",
                )}
              >
                {selected ? <Check className="size-3" aria-hidden /> : null}
                {opt.label}
              </button>
            );
          })}
        </div>
        {!isLease ? (
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-ink/75">
            <input
              type="checkbox"
              checked={filters.openHouseOnly}
              onChange={(e) =>
                onChange({ ...filters, openHouseOnly: e.target.checked })
              }
            />
            Open houses only
          </label>
        ) : null}
      </FilterPopover>

      <FilterPopover label={sortLabel} active={filters.sort !== "newest"}>
        <ChipRow
          value={filters.sort}
          options={[
            { value: "newest", label: "Newest" },
            { value: "price_asc", label: "Price: low to high" },
            { value: "price_desc", label: "Price: high to low" },
          ]}
          onChange={(v) =>
            onChange({ ...filters, sort: v as SearchFilters["sort"] })
          }
        />
      </FilterPopover>

      <FilterPopover label="More" wide>
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink/45">
              Segment
            </p>
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
          </div>
          <label className="block space-y-1 text-xs font-semibold uppercase tracking-wide text-ink/45">
            City
            <Input
              value={filters.city}
              onChange={(e) => onChange({ ...filters, city: e.target.value })}
              placeholder="Toronto"
            />
          </label>
          <label className="block space-y-1 text-xs font-semibold uppercase tracking-wide text-ink/45">
            Community
            <Input
              value={filters.community}
              onChange={(e) =>
                onChange({ ...filters, community: e.target.value })
              }
              placeholder="The Beaches"
            />
          </label>
        </div>
      </FilterPopover>

      {(filters.minPrice ||
        filters.maxPrice ||
        filters.minBeds ||
        filters.minBaths ||
        filters.propertyTypes.length > 0 ||
        filters.openHouseOnly ||
        filters.city ||
        filters.community ||
        !(
          filters.statuses.length === 1 && filters.statuses[0] === "ACTIVE"
        )) && (
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-ink/50 transition hover:text-danger"
          onClick={() =>
            onChange({
              ...filters,
              city: "",
              community: "",
              minPrice: "",
              maxPrice: "",
              minBeds: "",
              minBaths: "",
              propertyTypes: [],
              openHouseOnly: false,
              statuses: ["ACTIVE"],
            })
          }
        >
          <X className="size-3.5" aria-hidden />
          Clear
        </button>
      )}
    </div>
  );
}
