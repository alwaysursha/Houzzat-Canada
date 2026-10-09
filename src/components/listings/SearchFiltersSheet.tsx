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
  countActiveSearchFilters,
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
  searchFiltersToListingParams,
  searchFiltersToSavedQuery,
} from "@/lib/listings/saved-search-query";
import { planSavedSearchApplyUi } from "@/lib/listings/saved-search-confirm-flow";
import { rebaseFilterDraftPreservingEdits } from "@/lib/listings/search-state";
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
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex min-h-10 max-w-full items-center justify-center truncate rounded-full px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy/35 focus-visible:ring-offset-2 focus-visible:ring-offset-mist",
              selected
                ? "bg-canopy text-white shadow-sm"
                : "bg-surface text-ink/70 ring-1 ring-line/90 hover:bg-canopy/[0.06] hover:text-ink hover:ring-canopy/25",
            )}
          >
            {opt.label}
          </button>
        );
      })}
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
    <section className="min-w-0 space-y-3 rounded-2xl border border-line/60 bg-surface p-3.5 shadow-[0_1px_2px_rgba(20,32,28,0.03)]">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/40">
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
  onCommitFilters,
  onDraftOpen,
  onDraftCancel,
  resultCount,
  pending = false,
  resultNoun = "homes",
  signedIn = false,
  searchCallbackPath,
  previewExtras,
}: {
  open: boolean;
  onClose: () => void;
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  cities: string[];
  onCitiesChange: (next: string[]) => void;
  /** Atomic Apply: filters + cities in one URL sync (preferred). */
  onCommitFilters?: (next: SearchFilters, cities: string[]) => void;
  /**
   * Canonical draft lifecycle (Stage 2B-1). Compatibility: local draft state
   * remains for preview/UI until Sheet reads SearchState.draft directly.
   */
  onDraftOpen?: () => void;
  onDraftCancel?: () => void;
  resultCount: number;
  pending?: boolean;
  resultNoun?: string;
  signedIn?: boolean;
  searchCallbackPath: (filters: SearchFilters, cities?: string[]) => string;
  previewExtras?: {
    cities?: string;
    communities?: string;
    q?: string;
    west?: number;
    south?: number;
    east?: number;
    north?: number;
  };
}) {
  const router = useRouter();
  const { openAuth } = useAuthModal();
  const { toast } = useSiteAlert();
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);
  const [draft, setDraft] = useState(filters);
  const [draftCities, setDraftCities] = useState(cities);
  const [draftTotal, setDraftTotal] = useState(resultCount);
  const [draftPending, setDraftPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const historyPushedRef = useRef(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const cityFieldRef = useRef<StructuredCityFieldHandle>(null);
  const onCloseRef = useRef(onClose);
  const routerRef = useRef(router);
  /** Relative /search?... built from committed props / Apply — not window.location. */
  const intendedPathRef = useRef("");
  /** Cities last prepared on Apply — used when confirming after the field unmounts. */
  const applyCitiesRef = useRef(cities);
  /**
   * After Apply prepares cities/path, ignore lagging props so a pending
   * router.replace cannot wipe Mississauga before history restore runs.
   */
  const applyIntentLockedRef = useRef(false);
  const draftBaseRef = useRef({ filters, cities });
  const draftSessionRef = useRef(false);
  const draftRef = useRef(draft);
  const draftCitiesRef = useRef(draftCities);
  const onDraftOpenRef = useRef(onDraftOpen);
  const onDraftCancelRef = useRef(onDraftCancel);
  const resultCountRef = useRef(resultCount);
  draftRef.current = draft;
  draftCitiesRef.current = draftCities;
  onDraftOpenRef.current = onDraftOpen;
  onDraftCancelRef.current = onDraftCancel;
  resultCountRef.current = resultCount;
  onCloseRef.current = onClose;
  routerRef.current = router;
  if (!open) {
    applyIntentLockedRef.current = false;
  } else if (!applyIntentLockedRef.current) {
    // Back without Apply restores committed criteria, not uncommitted draft.
    intendedPathRef.current = searchCallbackPath(filters, cities);
    applyCitiesRef.current = draftCities;
  }
  const isLease = draft.transactionType === "LEASE";
  const pricePresets = isLease ? LEASE_PRICE_PRESETS : SALE_PRICE_PRESETS;
  const typeOptions =
    draft.segment === "COMMERCIAL" ? COMMERCIAL_TYPES : RESIDENTIAL_TYPES;
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
  const draftActiveCount =
    countActiveSearchFilters({ ...draft, city: "" }) +
    draftCities.filter((city) => city.trim()).length;

  useEffect(() => {
    setMounted(true);
  }, []);

  // OPEN_FILTERS / CANCEL_FILTERS + live-commit rebase of local UI draft.
  useEffect(() => {
    if (!open) {
      if (draftSessionRef.current) {
        draftSessionRef.current = false;
        onDraftCancelRef.current?.();
      }
      return;
    }
    if (!draftSessionRef.current) {
      draftSessionRef.current = true;
      draftBaseRef.current = { filters, cities };
      setDraft(filters);
      setDraftCities(cities);
      applyCitiesRef.current = cities;
      setDraftTotal(resultCountRef.current);
      onDraftOpenRef.current?.();
      return;
    }
    const rebased = rebaseFilterDraftPreservingEdits(
      draftBaseRef.current,
      { filters: draftRef.current, cities: draftCitiesRef.current },
      { filters, cities },
    );
    draftBaseRef.current = { filters, cities };
    setDraft(rebased.filters);
    setDraftCities(rebased.cities);
    applyCitiesRef.current = rebased.cities;
  }, [open, filters, cities]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDraftPending(true);
    const timer = window.setTimeout(async () => {
      try {
        const qs = searchFiltersToListingParams(draft, {
          communities: previewExtras?.communities,
          q: previewExtras?.q,
          west: previewExtras?.west,
          south: previewExtras?.south,
          east: previewExtras?.east,
          north: previewExtras?.north,
          cities: draftCities.length > 0 ? draftCities.join("|") : undefined,
          limit: 1,
        });
        const res = await fetch(`/api/listings/search?${qs}`);
        const data = (await res.json()) as { total?: number };
        if (!cancelled) setDraftTotal(data.total ?? 0);
      } catch {
        if (!cancelled) setDraftTotal(resultCount);
      } finally {
        if (!cancelled) setDraftPending(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, draft, draftCities, previewExtras, resultCount]);

  const closeViaUi = useCallback(() => {
    if (historyPushedRef.current) {
      window.history.back();
      return;
    }
    onCloseRef.current();
  }, []);

  /**
   * Close Filters after Apply without history.back().
   * history.back() would pop to the pre-Search entry (often Home) once the
   * filters marker sits on top of a Home → Search stack.
   */
  const closeAfterApply = useCallback(() => {
    if (historyPushedRef.current) {
      historyPushedRef.current = false;
      const path = intendedPathRef.current;
      if (path) {
        const absolute = new URL(path, window.location.origin).href;
        const state = {
          ...((window.history.state ?? {}) as Record<string, unknown>),
        };
        delete state.__NA;
        delete state.__PRIVATE_NEXTJS_INTERNALS_TREE;
        delete state.houzzatSearchFilters;
        window.history.replaceState(state, "", absolute);
        routerRef.current.replace(path, { scroll: false });
      }
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

  function flushDraftCities(): string[] | null {
    if (!cityFieldRef.current) {
      return applyCitiesRef.current;
    }
    const flushed = cityFieldRef.current.flush();
    if (!flushed.ok) return null;
    applyCitiesRef.current = flushed.cities;
    if (
      flushed.cities.length !== draftCities.length ||
      flushed.cities.some((city, index) => city !== draftCities[index])
    ) {
      setDraftCities(flushed.cities);
    }
    return flushed.cities;
  }

  function commitDraft(nextCities: string[]) {
    const next = { ...draft, city: "" };
    if (onCommitFilters) {
      onCommitFilters(next, nextCities);
      return;
    }
    onChange(next);
    onCitiesChange(nextCities);
  }

  async function persist(confirmReplace: boolean, applyCities: string[]) {
    const callbackPath = searchCallbackPath(draft, applyCities);
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
      closeAfterApply();
      return;
    }
    setSaving(true);
    const outcome = await savePrimarySearch({
      name: savedSearchDisplayName(draft, placeExtras),
      query: searchFiltersToSavedQuery(draft, placeExtras),
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
      closeAfterApply();
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
    if (plan.closeFilters) closeAfterApply();
  }

  async function applyAndSave(confirmReplace: boolean) {
    const nextCities = flushDraftCities();
    if (nextCities == null) return;
    // Lock before commit so Back restore keeps the applied Mississauga path.
    applyCitiesRef.current = nextCities;
    intendedPathRef.current = searchCallbackPath(draft, nextCities);
    applyIntentLockedRef.current = true;
    commitDraft(nextCities);
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
        <div
          className="relative z-10 flex shrink-0 items-center gap-2 border-b border-line/80 bg-surface py-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-[0_1px_0_rgba(20,32,28,0.04)]"
          style={{ paddingLeft: "1.25rem", paddingRight: "1.25rem" }}
        >
          <button
            type="button"
            onClick={closeViaUi}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink/70 transition hover:bg-mist hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy/35"
            aria-label="Back to search"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 id={titleId} className="text-lg font-semibold tracking-tight text-ink">
                Filters
              </h2>
              {draftActiveCount > 0 ? (
                <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-canopy px-1.5 py-0.5 text-[11px] font-bold leading-none text-white">
                  {draftActiveCount}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-ink/45">
              Choose your filters, then apply
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              // Draft-only: do not call shared resetStructuredFilters / commit.
              setDraft(resetSearchFilters(draft));
              setDraftCities([]);
              applyCitiesRef.current = [];
            }}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink/55 transition hover:bg-mist hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy/35"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Reset
          </button>
        </div>

        <div
          className="min-h-0 min-w-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain py-4"
          style={{ paddingLeft: "1.25rem", paddingRight: "1.25rem" }}
        >
          <Section title="Buy / Rent">
            <ChipRow
              value={draft.transactionType}
              options={[
                { value: "SALE", label: "Buy" },
                { value: "LEASE", label: "Rent" },
                { value: "ALL", label: "Both" },
              ]}
              onChange={(v) =>
                setDraft({
                  ...draft,
                  transactionType: v as SearchFilters["transactionType"],
                  statuses: ["ACTIVE"],
                  openHouseOnly:
                    v === "LEASE" ? false : draft.openHouseOnly,
                })
              }
            />
          </Section>

          <Section title="Residential / Commercial">
            <ChipRow
              value={draft.segment}
              options={[
                { value: "RESIDENTIAL", label: "Residential" },
                { value: "COMMERCIAL", label: "Commercial" },
                { value: "ALL", label: "All" },
              ]}
              onChange={(v) =>
                setDraft({
                  ...draft,
                  segment: v as SearchFilters["segment"],
                  minBeds: v === "COMMERCIAL" ? "" : draft.minBeds,
                  minBaths: v === "COMMERCIAL" ? "" : draft.minBaths,
                  propertyTypes: [],
                })
              }
            />
          </Section>

          <Section title="Location">
            <StructuredCityField
              ref={cityFieldRef}
              cities={draftCities}
              onCitiesChange={setDraftCities}
              presentation="sheet"
            />
            <label className="mt-3 block space-y-1.5 text-sm text-ink/70">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink/45">
                Community
              </span>
              <Input
                value={draft.community}
                onChange={(e) =>
                  setDraft({ ...draft, community: e.target.value })
                }
                placeholder="The Beaches"
                className="h-11 rounded-xl border-line/80 shadow-none focus-visible:border-canopy/40 focus-visible:ring-canopy/15"
              />
            </label>
          </Section>

          <Section title={isLease ? "Monthly rent" : "List price"}>
            <ChipRow
              value={`${draft.minPrice}|${draft.maxPrice}`}
              options={pricePresets.map((p) => ({
                value: `${p.min}|${p.max}`,
                label: p.label,
              }))}
              onChange={(v) => {
                const [min, max] = v.split("|");
                setDraft({
                  ...draft,
                  minPrice: min ?? "",
                  maxPrice: max ?? "",
                });
              }}
            />
            <div className="grid grid-cols-2 gap-2.5">
              <label className="min-w-0 space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">
                  Min
                </span>
                <Input
                  inputMode="numeric"
                  aria-label="Minimum price"
                  placeholder="No min"
                  value={draft.minPrice}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      minPrice: e.target.value.replace(/\D/g, ""),
                    })
                  }
                  className="h-11 rounded-xl border-line/80 shadow-none focus-visible:border-canopy/40 focus-visible:ring-canopy/15"
                />
              </label>
              <label className="min-w-0 space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">
                  Max
                </span>
                <Input
                  inputMode="numeric"
                  aria-label="Maximum price"
                  placeholder="No max"
                  value={draft.maxPrice}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      maxPrice: e.target.value.replace(/\D/g, ""),
                    })
                  }
                  className="h-11 rounded-xl border-line/80 shadow-none focus-visible:border-canopy/40 focus-visible:ring-canopy/15"
                />
              </label>
            </div>
          </Section>

          <Section title="Beds">
            <ChipRow
              value={draft.minBeds || ""}
              options={[
                { value: "", label: "Any" },
                { value: "1", label: "1+" },
                { value: "2", label: "2+" },
                { value: "3", label: "3+" },
                { value: "4", label: "4+" },
                { value: "5", label: "5+" },
              ]}
              onChange={(v) => setDraft({ ...draft, minBeds: v })}
            />
          </Section>

          <Section title="Baths">
            <ChipRow
              value={draft.minBaths || ""}
              options={[
                { value: "", label: "Any" },
                { value: "1", label: "1+" },
                { value: "2", label: "2+" },
                { value: "3", label: "3+" },
                { value: "4", label: "4+" },
              ]}
              onChange={(v) => setDraft({ ...draft, minBaths: v })}
            />
          </Section>

          <Section title="Home type">
            <div className="flex min-w-0 flex-wrap gap-2">
              {typeOptions.map((type) => {
                const selected = draft.propertyTypes.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      const next = selected
                        ? draft.propertyTypes.filter((t) => t !== type)
                        : [...draft.propertyTypes, type];
                      setDraft({ ...draft, propertyTypes: next });
                    }}
                    className={cn(
                      "inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy/35 focus-visible:ring-offset-2 focus-visible:ring-offset-mist",
                      selected
                        ? "bg-canopy text-white shadow-sm"
                        : "bg-surface text-ink/70 ring-1 ring-line/90 hover:bg-canopy/[0.06] hover:text-ink hover:ring-canopy/25",
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
                const selected = draft.statuses.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      if (selected) {
                        if (draft.statuses.length === 1) return;
                        setDraft({
                          ...draft,
                          statuses: draft.statuses.filter(
                            (s) => s !== opt.value,
                          ),
                        });
                        return;
                      }
                      setDraft({
                        ...draft,
                        statuses: [...draft.statuses, opt.value],
                      });
                    }}
                    className={cn(
                      "inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy/35 focus-visible:ring-offset-2 focus-visible:ring-offset-mist",
                      selected
                        ? "bg-canopy text-white shadow-sm"
                        : "bg-surface text-ink/70 ring-1 ring-line/90 hover:bg-canopy/[0.06] hover:text-ink hover:ring-canopy/25",
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
              <button
                type="button"
                role="switch"
                aria-checked={draft.openHouseOnly}
                onClick={() =>
                  setDraft({
                    ...draft,
                    openHouseOnly: !draft.openHouseOnly,
                  })
                }
                className={cn(
                  "mt-1 flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border px-3.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canopy/35",
                  draft.openHouseOnly
                    ? "border-canopy/30 bg-canopy/[0.08] text-canopy"
                    : "border-line/80 bg-mist/60 text-ink/70 hover:border-canopy/25",
                )}
              >
                <span className="text-sm font-semibold">Open houses only</span>
                <span
                  className={cn(
                    "inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition",
                    draft.openHouseOnly ? "bg-canopy" : "bg-line",
                  )}
                  aria-hidden
                >
                  <span
                    className={cn(
                      "size-5 rounded-full bg-white shadow-sm transition",
                      draft.openHouseOnly ? "translate-x-5" : "translate-x-0",
                    )}
                  />
                </span>
              </button>
            ) : null}
          </Section>

        </div>

        <div
          data-search-filters-apply=""
          className="relative z-10 shrink-0 border-t border-line/80 bg-surface pb-[max(1rem,env(safe-area-inset-bottom))] pt-3.5 shadow-[0_-6px_16px_rgba(20,32,28,0.05)]"
          style={{ paddingLeft: "1.25rem", paddingRight: "1.25rem" }}
        >
          <Button
            type="button"
            className="h-12 w-full gap-2 rounded-full text-base font-semibold shadow-sm"
            disabled={saving}
            onClick={() => void applyAndSave(false)}
          >
            {draftPending || pending || saving ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {saving ? "Saving…" : "Updating…"}
              </>
            ) : (
              <>
                Apply ·{" "}
                <span className="tabular-nums">
                  {draftTotal.toLocaleString("en-CA")}
                </span>{" "}
                {resultNoun}
              </>
            )}
          </Button>
          <p className="mt-2 text-center text-[11px] leading-snug text-ink/45">
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
