"use client";

import { X } from "lucide-react";
import {
  type SearchFilters,
  type SearchStatusOption,
} from "@/components/listings/SearchFilterChips";
import { propertyTypeLabel } from "@/lib/listings/constants";
import { cn } from "@/lib/utils";

type Chip = {
  key: string;
  label: string;
  onClear: () => void;
};

function statusChipLabel(
  statuses: SearchStatusOption[],
  isLease: boolean,
): string | null {
  if (statuses.length === 1 && statuses[0] === "ACTIVE") return null;
  const options: Record<SearchStatusOption, string> = isLease
    ? {
        ACTIVE: "For lease",
        SOLD_CONDITIONAL: "Leased conditional",
        SOLD: "Sold",
        LEASED: "Leased",
        UNLISTED: "Unlisted",
      }
    : {
        ACTIVE: "For sale",
        SOLD_CONDITIONAL: "Sold conditional",
        SOLD: "Sold",
        LEASED: "Leased",
        UNLISTED: "Unlisted",
      };
  if (statuses.length === 1) {
    return options[statuses[0]!] ?? "Status";
  }
  return `${statuses.length} statuses`;
}

function buildChips(
  filters: SearchFilters,
  onChange: (next: SearchFilters) => void,
): Chip[] {
  const isLease = filters.transactionType === "LEASE";
  const chips: Chip[] = [];

  if (filters.city || filters.community) {
    chips.push({
      key: "place",
      label: filters.community
        ? `${filters.community}, ${filters.city || "ON"}`
        : filters.city,
      onClear: () => onChange({ ...filters, city: "", community: "" }),
    });
  }

  if (filters.minPrice || filters.maxPrice) {
    const label = [
      filters.minPrice
        ? `$${Number(filters.minPrice).toLocaleString("en-CA")}`
        : null,
      filters.maxPrice
        ? `$${Number(filters.maxPrice).toLocaleString("en-CA")}`
        : null,
    ]
      .filter(Boolean)
      .join(" – ");
    chips.push({
      key: "price",
      label,
      onClear: () => onChange({ ...filters, minPrice: "", maxPrice: "" }),
    });
  }

  if (filters.minBeds) {
    chips.push({
      key: "beds",
      label: `${filters.minBeds}+ bd`,
      onClear: () => onChange({ ...filters, minBeds: "" }),
    });
  }

  if (filters.minBaths) {
    chips.push({
      key: "baths",
      label: `${filters.minBaths}+ ba`,
      onClear: () => onChange({ ...filters, minBaths: "" }),
    });
  }

  if (filters.propertyTypes.length === 1) {
    chips.push({
      key: "type",
      label: propertyTypeLabel(filters.propertyTypes[0]!),
      onClear: () => onChange({ ...filters, propertyTypes: [] }),
    });
  } else if (filters.propertyTypes.length > 1) {
    chips.push({
      key: "type",
      label: `${filters.propertyTypes.length} types`,
      onClear: () => onChange({ ...filters, propertyTypes: [] }),
    });
  }

  const statusLabel = statusChipLabel(filters.statuses, isLease);
  if (statusLabel) {
    chips.push({
      key: "status",
      label: statusLabel,
      onClear: () => onChange({ ...filters, statuses: ["ACTIVE"] }),
    });
  }

  if (filters.openHouseOnly) {
    chips.push({
      key: "oh",
      label: "Open houses",
      onClear: () => onChange({ ...filters, openHouseOnly: false }),
    });
  }

  if (filters.segment !== "RESIDENTIAL") {
    chips.push({
      key: "segment",
      label:
        filters.segment === "COMMERCIAL" ? "Commercial" : "All segments",
      onClear: () =>
        onChange({
          ...filters,
          segment: "RESIDENTIAL",
          propertyTypes: [],
        }),
    });
  }

  return chips;
}

/** Horizontal removable chips for active Search filters (mobile chrome). */
export function SearchActiveFilterStrip({
  filters,
  onChange,
  className,
}: {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  className?: string;
}) {
  const chips = buildChips(filters, onChange);
  if (chips.length === 0) return null;

  return (
    <div
      className={cn(
        "-mx-3 flex gap-2 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      role="list"
      aria-label="Active filters"
    >
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          role="listitem"
          title={`Clear ${chip.label}`}
          onClick={chip.onClear}
          className="inline-flex h-9 max-w-[14rem] shrink-0 items-center gap-1.5 rounded-full border border-canopy/35 bg-canopy/10 px-3 text-xs font-semibold text-canopy"
        >
          <span className="truncate">{chip.label}</span>
          <X className="size-3.5 shrink-0 opacity-70" aria-hidden />
        </button>
      ))}
      <button
        type="button"
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
            segment: "RESIDENTIAL",
          })
        }
        className="inline-flex h-9 shrink-0 items-center rounded-full px-2.5 text-xs font-semibold text-ink/50"
      >
        Clear all
      </button>
    </div>
  );
}
