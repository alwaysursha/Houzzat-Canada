"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { PropertyType } from "@prisma/client";
import { ArrowLeft, Check, Loader2, RotateCcw } from "lucide-react";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { browserCaptureIntentStore } from "@/components/auth/capture-intent-browser";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  StructuredCityField,
  type StructuredCityFieldHandle,
} from "@/components/listings/StructuredCityField";
import {
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
import { planSavedSearchApplyUi } from "@/lib/listings/saved-search-confirm-flow";
import { acquireScrollLock } from "@/lib/scroll-lock";
import { SITE_MESSAGES } from "@/lib/site-messages";
import { cn } from "@/lib/utils";
import { visualViewportOverlayStyle } from "@/lib/visual-viewport-overlay-style";

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
    <div className="flex min-w-0 flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "max-w-full truncate rounded-full px-3.5 py-2 text-sm font-semibold transition",
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
    <section className="min-w-0 space-y-3 border-b border-line/70 pb-5 last:border-b-0 last:pb-0">
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
  cities,
  onCitiesChange,
  onResetFilters,
  resultCount,
  pending = false,
  resultNoun = "homes",
  signedIn = false,
  searchCallbackPath,
}: {
  open: boolean;
  onClose: () => void;
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  cities: string[];
  onCitiesChange: (next: string[]) => void;
  onResetFilters: () => void;
  resultCount: number;
  pending?: boolean;
  resultNoun?: string;
  signedIn?: boolean;
  searchCallbackPath: (filters: SearchFilters, cities?: string[]) => string;
}) {
  const router = useRouter();
  const { openAuth } = useAuthModal();
  const { toast } = useSiteAlert();
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const historyPushedRef = useRef(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const cityFieldRef = useRef<StructuredCityFieldHandle>(null);
  const onCloseRef = useRef(onClose);
  const routerRef = useRef(router);
  /** Relative /search?... built from props / Apply — not window.location. */
  const intendedPathRef = useRef("");
  /** Cities last prepared on Apply — used when confirming after the field unmounts. */
  const applyCitiesRef = useRef(cities);
  /**
   * After Apply prepares cities/path, ignore lagging props so a pending
   * router.replace cannot wipe Mississauga before history restore runs.
   */
  const applyIntentLockedRef = useRef(false);
  onCloseRef.current = onClose;
  routerRef.current = router;
  if (!open) {
    applyIntentLockedRef.current = false;
  } else if (!applyIntentLockedRef.current) {
    intendedPathRef.current = searchCallbackPath(filters, cities);
    applyCitiesRef.current = cities;
  }
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
    if (historyPushedRef.current) {
      window.history.back();
      return;
    }
    onCloseRef.current();
  }, []);

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

  // Keep the portal root inside the visual viewport (keyboard + pinch-zoom).
  // Apply left/width as well as top/height so horizontal VV pans cannot drift
  // the sheet when filter chips are selected repeatedly.
  useEffect(() => {
    if (!open) return;

    function syncViewport() {
      const el = overlayRef.current;
      if (!el) return;
      const style = visualViewportOverlayStyle(window.visualViewport);
      el.style.left = style.left;
      el.style.top = style.top;
      el.style.width = style.width;
      el.style.height = style.height;
      el.style.right = style.right;
      el.style.bottom = style.bottom;
    }

    syncViewport();
    window.addEventListener("resize", syncViewport);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", syncViewport);
    vv?.addEventListener("scroll", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
      vv?.removeEventListener("resize", syncViewport);
      vv?.removeEventListener("scroll", syncViewport);
      const el = overlayRef.current;
      if (!el) return;
      el.style.left = "";
      el.style.top = "";
      el.style.width = "";
      el.style.height = "";
      el.style.right = "";
      el.style.bottom = "";
    };
  }, [open, mounted]);

  // Hardware / browser Back closes Filters and stays on this Search URL.
  // Capture phase + stopImmediatePropagation so Next's popstate handler does not
  // treat the same-URL history entry as leaving /search. The marker is not a
  // query param. Manual close uses history.back() so the entry is consumed.
  // After back, restore the intended /search path (filters + cities from React
  // props), then router.replace so App Router searchParams match the bar.
  useEffect(() => {
    if (!open) return;

    if (!historyPushedRef.current) {
      const prev = (window.history.state ?? {}) as FiltersHistoryState;
      if (prev.houzzatSearchFilters) {
        historyPushedRef.current = true;
      } else {
        window.history.pushState({ ...prev, houzzatSearchFilters: true }, "");
        historyPushedRef.current = true;
      }
    }

    const onPopState = (event: PopStateEvent) => {
      if (!historyPushedRef.current) return;
      event.stopImmediatePropagation();
      historyPushedRef.current = false;
      const path = intendedPathRef.current;
      if (path) {
        const absolute = new URL(path, window.location.origin).href;
        if (window.location.href !== absolute) {
          const state = {
            ...((window.history.state ?? {}) as Record<string, unknown>),
          };
          delete state.__NA;
          delete state.__PRIVATE_NEXTJS_INTERNALS_TREE;
          delete state.houzzatSearchFilters;
          window.history.replaceState(state, "", absolute);
        }
        // replaceState updates the bar; router.replace syncs useSearchParams
        // after Next may have applied the prior history entry from Back.
        routerRef.current.replace(path, { scroll: false });
      }
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPopState, true);
    return () => {
      window.removeEventListener("popstate", onPopState, true);
    };
  }, [open]);

  function prepareApplyCities(): string[] | null {
    if (!cityFieldRef.current) {
      const nextCities = applyCitiesRef.current;
      intendedPathRef.current = searchCallbackPath(filters, nextCities);
      applyIntentLockedRef.current = true;
      return nextCities;
    }
    const flushed = cityFieldRef.current.flush();
    if (!flushed.ok) return null;
    // Lock before onCitiesChange so lagging props cannot overwrite this path.
    applyCitiesRef.current = flushed.cities;
    intendedPathRef.current = searchCallbackPath(filters, flushed.cities);
    applyIntentLockedRef.current = true;
    return flushed.cities;
  }

  async function persist(confirmReplace: boolean, applyCities: string[]) {
    const callbackPath = searchCallbackPath(filters, applyCities);
    const placeExtras = { cities: applyCities };
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
      name: savedSearchDisplayName(filters, placeExtras),
      query: searchFiltersToSavedQuery(filters, placeExtras),
      confirmReplace,
    });
    setSaving(false);
    if (outcome.status === "auth") {
      openAuth({ mode: "sign-in", callbackUrl: callbackPath });
      return;
    }
    if (outcome.status === "error") {
      toast({
        message: outcome.message || SITE_MESSAGES.genericErrorToast,
        tone: "error",
      });
      return;
    }
    const plan = planSavedSearchApplyUi(outcome.status);
    if (plan.openConfirm) {
      // Close Filters first so confirmation is not stacked on the VV overlay.
      setConfirmOpen(true);
      closeViaUi();
      return;
    }
    if (plan.toastSuccess) {
      toast({
        message: confirmReplace
          ? "Primary search updated. Previous search kept as secondary."
          : "Search saved to your buyer profile.",
        tone: "success",
      });
    }
    setConfirmOpen(false);
    if (plan.closeFilters) closeViaUi();
  }

  async function applyAndSave(confirmReplace: boolean) {
    const nextCities = prepareApplyCities();
    if (nextCities == null) return;
    const unchanged =
      nextCities.length === cities.length &&
      nextCities.every((city, index) => city === cities[index]);
    if (!unchanged) onCitiesChange(nextCities);
    await persist(confirmReplace, nextCities);
  }

  if (!mounted) return null;
  // Keep mounted while the saved-search confirmation is open after Filters closes.
  if (!open && !confirmOpen) return null;

  return createPortal(
    <>
    {open ? (
    <div
      ref={overlayRef}
      data-search-filters-overlay=""
      className="fixed top-0 left-0 z-[90] h-full w-full overflow-hidden overscroll-none"
      role="presentation"
    >
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
        data-search-filters-sheet=""
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-md min-w-0 flex-col overflow-hidden bg-mist shadow-2xl transition-transform duration-300 ease-out",
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
            onClick={onResetFilters}
            className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink/60 transition hover:bg-mist hover:text-danger"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Reset
          </button>
        </div>

        <div className="min-h-0 min-w-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-5">
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
            <StructuredCityField
              ref={cityFieldRef}
              cities={cities}
              onCitiesChange={onCitiesChange}
            />
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
            <div className="flex min-w-0 flex-wrap gap-2">
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
                      "inline-flex max-w-full items-center gap-1 rounded-full px-3.5 py-2 text-sm font-semibold transition",
                      selected
                        ? "bg-canopy text-white"
                        : "bg-surface text-ink/70 ring-1 ring-line hover:bg-line/40",
                    )}
                  >
                    {selected ? (
                      <Check className="size-3.5 shrink-0" aria-hidden />
                    ) : null}
                    <span className="truncate">{propertyTypeLabel(type)}</span>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Status">
            <div className="flex min-w-0 flex-wrap gap-2">
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
                      "inline-flex max-w-full items-center gap-1 rounded-full px-3.5 py-2 text-sm font-semibold transition",
                      selected
                        ? "bg-canopy text-white"
                        : "bg-surface text-ink/70 ring-1 ring-line hover:bg-line/40",
                    )}
                  >
                    {selected ? (
                      <Check className="size-3.5 shrink-0" aria-hidden />
                    ) : null}
                    <span className="truncate">{opt.label}</span>
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

        </div>

        <div
          data-search-filters-apply=""
          className="shrink-0 border-t border-line bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <Button
            type="button"
            className="h-12 w-full gap-2"
            disabled={saving}
            onClick={() => void applyAndSave(false)}
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
    </div>
    ) : null}
    <UpdateSavedSearchDialog
      open={confirmOpen}
      pending={saving}
      onCancel={() => setConfirmOpen(false)}
      onConfirm={() => void applyAndSave(true)}
    />
    </>,
    document.body,
  );
}
