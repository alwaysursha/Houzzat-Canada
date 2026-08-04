"use client";

import { useMemo, type ReactNode } from "react";
import type { PropertyType } from "@prisma/client";
import { propertyTypeLabel } from "@/lib/listings/constants";
import { cn } from "@/lib/utils";

export const RESIDENTIAL_TYPES: PropertyType[] = [
  "DETACHED",
  "SEMI_DETACHED",
  "TOWNHOUSE",
  "CONDO_APT",
  "CONDO_TOWNHOUSE",
  "MULTIPLEX",
];

export const BED_OPTIONS = ["", "1", "2", "3", "4", "5"];
export const BATH_OPTIONS = ["", "1", "2", "3", "4"];

export type CriteriaForm = {
  city: string;
  /** Comma-separated communities (supports multi like Looking for). */
  communities: string;
  minPrice: string;
  maxPrice: string;
  minBeds: string;
  minBaths: string;
  transactionType: "SALE" | "LEASE" | "";
  propertyTypes: PropertyType[];
};

function asString(value: unknown): string {
  if (value == null || value === "") return "";
  return String(value).trim();
}

function parsePropertyTypes(raw: unknown): PropertyType[] {
  const allowed = new Set<string>(RESIDENTIAL_TYPES);
  const list: string[] = [];
  if (typeof raw === "string") {
    list.push(...raw.split(",").map((t) => t.trim()));
  } else if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string") list.push(item.trim());
    }
  }
  return list.filter((t): t is PropertyType => allowed.has(t));
}

function parseList(raw: unknown, singular?: unknown): string[] {
  const out: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && item.trim()) out.push(item.trim());
    }
  } else if (typeof raw === "string" && raw.trim()) {
    out.push(
      ...raw
        .split(/[,|]/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }
  if (!out.length && typeof singular === "string" && singular.trim()) {
    out.push(singular.trim());
  }
  return [...new Set(out)];
}

export function emptyCriteriaForm(): CriteriaForm {
  return {
    city: "",
    communities: "",
    minPrice: "",
    maxPrice: "",
    minBeds: "",
    minBaths: "",
    transactionType: "",
    propertyTypes: [],
  };
}

export function parseCriteria(query: unknown): CriteriaForm {
  const q =
    query && typeof query === "object"
      ? (query as Record<string, unknown>)
      : {};

  const cities = parseList(q.cities, q.city);
  const communities = parseList(q.communities, q.community);
  const txn = asString(q.transactionType).toUpperCase();

  return {
    city: cities[0] ?? "",
    communities: communities.join(", "),
    minPrice: asString(q.minPrice),
    maxPrice: asString(q.maxPrice),
    minBeds: asString(q.minBeds),
    minBaths: asString(q.minBaths),
    transactionType: txn === "LEASE" || txn === "SALE" ? txn : "",
    propertyTypes: parsePropertyTypes(q.propertyTypes ?? q.propertyType),
  };
}

export function criteriaToQuery(
  form: CriteriaForm,
  previous?: unknown,
): Record<string, unknown> {
  const base =
    previous && typeof previous === "object"
      ? { ...(previous as Record<string, unknown>) }
      : {};

  delete base.city;
  delete base.cities;
  delete base.community;
  delete base.communities;
  delete base.minPrice;
  delete base.maxPrice;
  delete base.minBeds;
  delete base.minBaths;
  delete base.maxBeds;
  delete base.transactionType;
  delete base.propertyTypes;
  delete base.propertyType;

  if (form.city.trim()) base.city = form.city.trim();

  const communities = form.communities
    .split(/[,|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (communities.length === 1) base.community = communities[0];
  else if (communities.length > 1) base.communities = communities;

  if (form.minPrice) base.minPrice = form.minPrice.replace(/[^0-9]/g, "");
  if (form.maxPrice) base.maxPrice = form.maxPrice.replace(/[^0-9]/g, "");
  if (form.minBeds) base.minBeds = form.minBeds;
  if (form.minBaths) base.minBaths = form.minBaths;
  if (form.transactionType) base.transactionType = form.transactionType;
  if (form.propertyTypes.length) {
    base.propertyTypes = form.propertyTypes.join(",");
  }

  return base;
}

export function criteriaSummaryChips(form: CriteriaForm): string[] {
  const chips: string[] = [];
  if (form.transactionType === "LEASE") chips.push("For lease");
  else if (form.transactionType === "SALE") chips.push("For sale");
  if (form.city.trim()) chips.push(form.city.trim());
  for (const c of form.communities
    .split(/[,|]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4)) {
    chips.push(c);
  }
  if (form.minPrice || form.maxPrice) {
    const lo = form.minPrice
      ? `$${Number(form.minPrice.replace(/[^0-9]/g, "") || 0).toLocaleString("en-CA")}`
      : null;
    const hi = form.maxPrice
      ? `$${Number(form.maxPrice.replace(/[^0-9]/g, "") || 0).toLocaleString("en-CA")}`
      : null;
    const range = [lo, hi].filter(Boolean).join(" – ");
    if (range) chips.push(range);
  }
  if (form.minBeds) chips.push(`${form.minBeds}+ beds`);
  if (form.minBaths) chips.push(`${form.minBaths}+ baths`);
  for (const t of form.propertyTypes.slice(0, 3)) {
    chips.push(propertyTypeLabel(t));
  }
  if (form.propertyTypes.length > 3) {
    chips.push(`+${form.propertyTypes.length - 3} types`);
  }
  return chips;
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748b]">
      {children}
    </span>
  );
}

function fieldClassName(className?: string) {
  return cn(
    "w-full rounded-lg border border-[#d8dee6] bg-white px-3 py-2 text-[13px] text-[#1e2a38] outline-none transition placeholder:text-[#94a3b8] focus:border-[#2b6cb0] focus:ring-2 focus:ring-[#2b6cb0]/15",
    className,
  );
}

export function SearchCriteriaFields({
  form,
  onChange,
  compact,
}: {
  form: CriteriaForm;
  onChange: (next: CriteriaForm) => void;
  compact?: boolean;
}) {
  const chips = useMemo(() => criteriaSummaryChips(form), [form]);

  function patch(partial: Partial<CriteriaForm>) {
    onChange({ ...form, ...partial });
  }

  function toggleType(type: PropertyType) {
    const on = form.propertyTypes.includes(type);
    patch({
      propertyTypes: on
        ? form.propertyTypes.filter((t) => t !== type)
        : [...form.propertyTypes, type],
    });
  }

  function removeCommunity(name: string) {
    const next = form.communities
      .split(/[,|]/)
      .map((s) => s.trim())
      .filter((c) => c && c.toLowerCase() !== name.toLowerCase());
    patch({ communities: next.join(", ") });
  }

  return (
    <div className={cn("space-y-4", compact && "space-y-3")}>
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => {
            const isCommunity = form.communities
              .split(/[,|]/)
              .map((s) => s.trim().toLowerCase())
              .includes(chip.toLowerCase());
            return (
              <button
                key={chip}
                type="button"
                title={isCommunity ? "Remove community" : undefined}
                onClick={() => {
                  if (isCommunity) removeCommunity(chip);
                }}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  isCommunity
                    ? "bg-white text-[#0369a1] ring-1 ring-[#7dd3fc] hover:bg-[#fee2e2] hover:text-[#be123c] hover:ring-[#fecdd3]"
                    : "bg-[#f1f5f9] text-[#334155]",
                )}
              >
                {chip}
                {isCommunity ? " ×" : ""}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <FieldLabel>City</FieldLabel>
          <input
            value={form.city}
            onChange={(e) => patch({ city: e.target.value })}
            placeholder="e.g. Mississauga"
            className={fieldClassName()}
          />
        </label>
        <label className="block sm:col-span-1">
          <FieldLabel>Communities</FieldLabel>
          <input
            value={form.communities}
            onChange={(e) => patch({ communities: e.target.value })}
            placeholder="Rathwood, East Credit"
            className={fieldClassName()}
          />
        </label>
      </div>

      <div>
        <FieldLabel>Transaction</FieldLabel>
        <div className="inline-flex rounded-xl border border-[#d8dee6] bg-[#f8fafc] p-1">
          {(
            [
              ["", "Any"],
              ["SALE", "For sale"],
              ["LEASE", "For lease"],
            ] as const
          ).map(([value, label]) => {
            const active = form.transactionType === value;
            return (
              <button
                key={label}
                type="button"
                onClick={() => patch({ transactionType: value })}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[12px] font-semibold transition",
                  active
                    ? "bg-white text-[#2b6cb0] shadow-sm"
                    : "text-[#64748b] hover:text-[#1e2a38]",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <FieldLabel>Min price</FieldLabel>
          <input
            inputMode="numeric"
            value={form.minPrice}
            onChange={(e) => patch({ minPrice: e.target.value })}
            placeholder="400000"
            className={fieldClassName()}
          />
        </label>
        <label className="block">
          <FieldLabel>Max price</FieldLabel>
          <input
            inputMode="numeric"
            value={form.maxPrice}
            onChange={(e) => patch({ maxPrice: e.target.value })}
            placeholder="900000"
            className={fieldClassName()}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <FieldLabel>Min beds</FieldLabel>
          <select
            value={form.minBeds}
            onChange={(e) => patch({ minBeds: e.target.value })}
            className={fieldClassName("appearance-none")}
          >
            {BED_OPTIONS.map((v) => (
              <option key={v || "any"} value={v}>
                {v ? `${v}+` : "Any"}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <FieldLabel>Min baths</FieldLabel>
          <select
            value={form.minBaths}
            onChange={(e) => patch({ minBaths: e.target.value })}
            className={fieldClassName("appearance-none")}
          >
            {BATH_OPTIONS.map((v) => (
              <option key={v || "any"} value={v}>
                {v ? `${v}+` : "Any"}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <FieldLabel>Property type</FieldLabel>
        <div className="flex flex-wrap gap-1.5">
          {RESIDENTIAL_TYPES.map((type) => {
            const on = form.propertyTypes.includes(type);
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleType(type)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[12px] font-semibold transition",
                  on
                    ? "bg-[#2b6cb0] text-white shadow-sm"
                    : "bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0]",
                )}
              >
                {propertyTypeLabel(type)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
