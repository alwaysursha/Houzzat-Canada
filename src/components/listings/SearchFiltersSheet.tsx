"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { PropertyType } from "@prisma/client";
import { ArrowLeft, Check, Loader2, RotateCcw } from "lucide-react";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { browserCaptureIntentStore } from "@/components/auth/capture-intent-browser";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  resetSearchFilters,
  type SearchFilters,
  type SearchStatusOption,
} from "@/components/listings/SearchFilterChips";
import { UpdateSavedSearchDialog } from "@/components/listings/UpdateSavedSearchDialog";
import { openGuestSaveSearchIntent } from "@/lib/auth/save-search-intent";
import { propertyTypeLabel } from "@/lib/listings/constants";
import { savePrimarySearch } from "@/lib/listings/save-primary-search";
import {
  savedSearchDisplayName,
  searchFiltersToSavedQuery,
} from "@/lib/listings/saved-search-query";
import { acquireScrollLock } from "@/lib/scroll-lock";
import { SITE_MESSAGES } from "@/lib/site-messages";
import { cn } from "@/lib/utils";

type FiltersHistoryState = { houzzatSearchFilters?: boolean };

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
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-full px-3.5 py-2 text-sm font-semibold transition",
            value === opt.value
              ? "bg-canopy text-white"
              : "bg-surface text-ink/70 ring-1 ring-line hover:bg-line/40",
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
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 border-b border-line/70 pb-5 last:border-b-0 last:pb-0">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/45">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Full-screen mobile filter sheet — slides in over the map. */
export function SearchFiltersSheet({
  open,
  onClose,
  filters,
  onChange,
  resultCount,
  pending = false,
  resultNoun = "homes",
  signedIn = false,
  callbackPath,
}: {
  open: boolean;
  onClose: () => void;
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  resultCount: number;
  pending?: boolean;
  resultNoun?: string;
  signedIn?: boolean;
  callbackPath: string;
}) {
  const { openAuth } = useAuthModal();
  const { toast } = useSiteAlert();
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const historyPushedRef = useRef(false);
  const isLease = filters.transactionType === "LEASE";
  const pricePresets = isLease ? LEASE_PRICE_PRESETS : SALE_PRICE_PRESETS;
  const typeOptions =
    filters.segment === "COMMERCIAL" ? COMMERCIAL_TYPES : RESIDENTIAL_TYPES;
  const statusOptions: { value: SearchStatusOption; label: string }[] = isLease
    ? [
        { value: "ACTIVE", label: "For lease" },
        { value: "SOLD_CONDITIONAL", label: "Leased conditional" },
        { value: "LEASED", label: "Leased" },
        { value: "UNLISTED", label: "Unlisted" },
      ]
    : [
        { value: "ACTIVE", label: "For sale" },
        { value: "SOLD_CONDITIONAL", label: "Sold conditional" },
        { value: "SOLD", label: "Sold" },
        { value: "UNLISTED", label: "Unlisted" },
      ];

  useEffect(() => {
    setMounted(true);
  }, []);

  const closeViaUi = useCallback(() => {
    if (
      historyPushedRef.current &&
      (window.history.state as FiltersHistoryState | null)?.houzzatSearchFilters
    ) {
      historyPushedRef.current = false;
      window.history.back();
      return;
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const release = acquireScrollLock();
    const frame = window.requestAnimationFrame(() => setEntered(true));
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeViaUi();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      release();
      document.removeEventListener("keydown", onKey);
    };
  }, [open, closeViaUi]);

  // Hardware / browser Back closes Filters before leaving Search.
  useEffect(() => {
    if (!open) {
      historyPushedRef.current = false;
      return;
    }

    const prev = (window.history.state ?? {}) as FiltersHistoryState;
    if (!prev.houzzatSearchFilters) {
      window.history.pushState({ ...prev, houzzatSearchFilters: true }, "");
      historyPushedRef.current = true;
    }

    const onPopState = () => {
      historyPushedRef.current = false;
      onClose();
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [open, onClose]);

  async function persist(confirmReplace: boolean) {
    if (!signedIn) {
      const opened = openGuestSaveSearchIntent({
        callbackPath,
        host: window.location.hostname,
        now: Date.now(),
        store: browserCaptureIntentStore(),
        openAuth,
      });
      if (!opened.ok) {
        openAuth({ mode: "sign-in", callbackUrl: callbackPath });
      }
      toast({
        message: "Sign in to save this search to your buyer profile.",
        tone: "info",
      });
      closeViaUi();
      return;
    }
    setSaving(true);
    const outcome = await savePrimarySearch({
      name: savedSearchDisplayName(filters),
      query: searchFiltersToSavedQuery(filters),
      confirmReplace,
    });
    setSaving(false);
    if (outcome.status === "auth") {
      openAuth({ mode: "sign-in", callbackUrl: callbackPath });
      return;
    }
    if (outcome.status === "needs_confirm") {
      setConfirmOpen(true);
      return;
    }
    if (outcome.status === "error") {
      toast({
        message: outcome.message || SITE_MESSAGES.genericErrorToast,
        tone: "error",
      });
      return;
    }
    toast({
      message: confirmReplace
        ? "Primary search updated. Previous search kept as secondary."
        : "Search saved to your buyer profile.",
      tone: "success",
    });
    setConfirmOpen(false);
    closeViaUi();
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90]" role="presentation">
      <button
        type="button"
        aria-label="Close filters"
        className={cn(
          "absolute inset-0 bg-ink/45 transition-opacity duration-300",
          entered ? "opacity-100" : "opacity-0",
        )}
        onClick={closeViaUi}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-mist shadow-2xl transition-transform duration-300 ease-out",
          entered ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2.5 pt-[max(0.65rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={closeViaUi}
            className="inline-flex size-10 items-center justify-center rounded-full text-ink/70 transition hover:bg-mist hover:text-ink"
            aria-label="Back to search"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </button>
          <h2 id={titleId} className="flex-1 text-base font-semibold text-ink">
            Filters
          </h2>
          <button
            type="button"
            onClick={() => onChange(resetSearchFilters(filters))}
            className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink/60 transition hover:bg-mist hover:text-danger"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Reset
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5">
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
                value={filters.minPrice}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    minPrice: e.target.value.replace(/\D/g, ""),
                  })
                }
              />
              <Input
                inputMode="numeric"
                placeholder="Max"
                value={filters.maxPrice}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    maxPrice: e.target.value.replace(/\D/g, ""),
                  })
                }
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

          <Section title="Home type">
            <div className="flex flex-wrap gap-2">
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
                      "inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-semibold transition",
                      selected
                        ? "bg-canopy text-white"
                        : "bg-surface text-ink/70 ring-1 ring-line hover:bg-line/40",
                    )}
                  >
                    {selected ? <Check className="size-3.5" aria-hidden /> : null}
                    {propertyTypeLabel(type)}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Status">
            <div className="flex flex-wrap gap-2">
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
                          statuses: filters.statuses.filter(
                            (s) => s !== opt.value,
                          ),
                        });
                        return;
                      }
                      onChange({
                        ...filters,
                        statuses: [...filters.statuses, opt.value],
                      });
                    }}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-semibold transition",
                      selected
                        ? "bg-canopy text-white"
                        : "bg-surface text-ink/70 ring-1 ring-line hover:bg-line/40",
                    )}
                  >
                    {selected ? <Check className="size-3.5" aria-hidden /> : null}
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {!isLease ? (
              <label className="mt-1 flex cursor-pointer items-center gap-2 text-sm text-ink/75">
                <input
                  type="checkbox"
                  checked={filters.openHouseOnly}
                  onChange={(e) =>
                    onChange({
                      ...filters,
                      openHouseOnly: e.target.checked,
                    })
                  }
                />
                Open houses only
              </label>
            ) : null}
          </Section>

          <Section title="Segment">
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
            <label className="block space-y-1.5 text-sm text-ink/70">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink/45">
                City
              </span>
              <Input
                value={filters.city}
                onChange={(e) =>
                  onChange({ ...filters, city: e.target.value })
                }
                placeholder="Toronto"
              />
            </label>
            <label className="mt-3 block space-y-1.5 text-sm text-ink/70">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink/45">
                Community
              </span>
              <Input
                value={filters.community}
                onChange={(e) =>
                  onChange({ ...filters, community: e.target.value })
                }
                placeholder="The Beaches"
              />
            </label>
          </Section>
        </div>

        <div className="shrink-0 border-t border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button
            type="button"
            className="h-12 w-full gap-2"
            disabled={saving}
            onClick={() => void persist(false)}
          >
            {pending || saving ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {saving ? "Saving…" : "Updating…"}
              </>
            ) : (
              <>
                Apply ·{" "}
                <span className="tabular-nums">
                  {resultCount.toLocaleString("en-CA")}
                </span>{" "}
                {resultNoun}
              </>
            )}
          </Button>
          <p className="mt-2 text-center text-[11px] text-ink/45">
            Saves to your buyer profile for property alerts
          </p>
        </div>
      </div>
      <UpdateSavedSearchDialog
        open={confirmOpen}
        pending={saving}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void persist(true)}
      />
    </div>,
    document.body,
  );
}
