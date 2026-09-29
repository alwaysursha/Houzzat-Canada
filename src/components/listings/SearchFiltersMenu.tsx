"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { PropertyType } from "@prisma/client";
import {
  Check,
  ChevronDown,
  ListFilter,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { browserCaptureIntentStore } from "@/components/auth/capture-intent-browser";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import {
  countActiveSearchFilters,
  resetSearchFilters,
  type SearchFilters,
  type SearchStatusOption,
} from "@/components/listings/SearchFilterChips";
import { UpdateSavedSearchDialog } from "@/components/listings/UpdateSavedSearchDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { propertyTypeLabel } from "@/lib/listings/constants";
import { openGuestSaveSearchIntent } from "@/lib/auth/save-search-intent";
import { savePrimarySearch } from "@/lib/listings/save-primary-search";
import {
  savedSearchDisplayName,
  searchFiltersToListingParams,
  searchFiltersToSavedQuery,
} from "@/lib/listings/saved-search-query";
import { SITE_MESSAGES } from "@/lib/site-messages";
import { useFlyoutFixedStyle } from "@/lib/use-flyout-fixed-style";
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

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5 border-b border-line/70 pb-4 last:border-b-0 last:pb-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/45">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function SearchFiltersMenu({
  filters,
  onChange,
  resultCount,
  resultNoun = "homes",
  signedIn,
  previewExtras,
  searchCallbackPath,
  hidePlaceChip = false,
}: {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  resultCount: number;
  resultNoun?: string;
  signedIn: boolean;
  searchCallbackPath: (filters: SearchFilters) => string;
  previewExtras?: {
    cities?: string;
    communities?: string;
    q?: string;
    west?: number;
    south?: number;
    east?: number;
    north?: number;
  };
  /** Location lives in the search field; do not repeat it as a chip. */
  hidePlaceChip?: boolean;
}) {
  const { openAuth } = useAuthModal();
  const { toast } = useSiteAlert();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState(filters);
  const [draftTotal, setDraftTotal] = useState(resultCount);
  const [draftPending, setDraftPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const flyoutStyle = useFlyoutFixedStyle(open, buttonRef, 400);
  const activeCount = countActiveSearchFilters(filters);
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

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setDraft(filters);
    setDraftTotal(resultCount);
  }, [open, filters, resultCount]);

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
      if (event.key === "Escape" && !confirmOpen) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, confirmOpen]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setDraftPending(true);
    const timer = window.setTimeout(async () => {
      try {
        const qs = searchFiltersToListingParams(draft, {
          ...previewExtras,
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
  }, [open, draft, previewExtras, resultCount]);

  async function persist(confirmReplace: boolean) {
    if (!signedIn) {
      const callbackPath = searchCallbackPath(draft);
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
      return false;
    }
    setSaving(true);
    const outcome = await savePrimarySearch({
      name: savedSearchDisplayName(draft),
      query: searchFiltersToSavedQuery(draft),
      confirmReplace,
    });
    setSaving(false);

    if (outcome.status === "auth") {
      openAuth({ mode: "sign-in", callbackUrl: searchCallbackPath(draft) });
      return false;
    }
    if (outcome.status === "needs_confirm") {
      setConfirmOpen(true);
      return false;
    }
    if (outcome.status === "error") {
      toast({
        message: outcome.message || SITE_MESSAGES.genericErrorToast,
        tone: "error",
      });
      return false;
    }
    toast({
      message: confirmReplace
        ? "Primary search updated. Previous search kept as secondary."
        : "Search saved to your buyer profile.",
      tone: "success",
    });
    return true;
  }

  async function applyAndSave() {
    onChange(draft);
    const ok = await persist(false);
    if (ok) {
      setOpen(false);
      setConfirmOpen(false);
    }
  }

  async function confirmUpdate() {
    onChange(draft);
    const ok = await persist(true);
    if (ok) {
      setConfirmOpen(false);
      setOpen(false);
    }
  }

  const panel =
    open && flyoutStyle ? (
      <div
        ref={menuRef}
        role="dialog"
        aria-labelledby={id}
        style={flyoutStyle}
        className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line/80 px-4 py-3">
          <p id={id} className="text-sm font-semibold text-ink">
            Search filters
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDraft(resetSearchFilters(draft))}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-ink/50 transition hover:bg-mist hover:text-danger"
            >
              <RotateCcw className="size-3.5" aria-hidden />
              Reset
            </button>
            <button
              type="button"
              aria-label="Close filters"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-ink/40 transition hover:bg-mist hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
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
            <div className="grid grid-cols-2 gap-2">
              <Input
                inputMode="numeric"
                placeholder="Min"
                value={draft.minPrice}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    minPrice: e.target.value.replace(/\D/g, ""),
                  })
                }
              />
              <Input
                inputMode="numeric"
                placeholder="Max"
                value={draft.maxPrice}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    maxPrice: e.target.value.replace(/\D/g, ""),
                  })
                }
              />
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
            <div className="flex flex-wrap gap-1.5">
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
          </Section>

          <Section title="Status">
            <div className="flex flex-wrap gap-1.5">
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
              <label className="mt-1 flex cursor-pointer items-center gap-2 text-sm text-ink/75">
                <input
                  type="checkbox"
                  checked={draft.openHouseOnly}
                  onChange={(e) =>
                    setDraft({ ...draft, openHouseOnly: e.target.checked })
                  }
                />
                Open houses only
              </label>
            ) : null}
          </Section>

          <Section title="Segment">
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
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block space-y-1 text-xs font-semibold uppercase tracking-wide text-ink/45">
                City
                <Input
                  value={draft.city}
                  onChange={(e) =>
                    setDraft({ ...draft, city: e.target.value })
                  }
                  placeholder="Toronto"
                />
              </label>
              <label className="block space-y-1 text-xs font-semibold uppercase tracking-wide text-ink/45">
                Community
                <Input
                  value={draft.community}
                  onChange={(e) =>
                    setDraft({ ...draft, community: e.target.value })
                  }
                  placeholder="The Beaches"
                />
              </label>
            </div>
          </Section>
        </div>

        <div className="shrink-0 border-t border-line/80 bg-mist/50 px-4 py-3">
          <Button
            type="button"
            className="h-11 w-full gap-2"
            disabled={saving}
            onClick={() => void applyAndSave()}
          >
            {saving || draftPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {saving ? (
              "Saving…"
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
          <p className="mt-2 text-center text-[11px] text-ink/45">
            Applies filters and saves to your buyer profile for alerts
          </p>
        </div>
      </div>
    ) : null;

  return (
    <>
      <div className="relative flex flex-wrap items-center gap-2" ref={rootRef}>
        {!hidePlaceChip && (filters.city || filters.community) ? (
          <button
            type="button"
            title="Clear location"
            onClick={() => onChange({ ...filters, city: "", community: "" })}
            className="inline-flex h-9 max-w-[14rem] items-center gap-1.5 rounded-full border border-canopy/35 bg-canopy/10 px-3 text-xs font-semibold text-canopy transition hover:bg-canopy/15"
          >
            <span className="truncate">
              {filters.community
                ? `${filters.community}, ${filters.city || "ON"}`
                : filters.city}
            </span>
            <X className="size-3.5 shrink-0 opacity-70" aria-hidden />
          </button>
        ) : null}
        <button
          ref={buttonRef}
          type="button"
          id={`${id}-trigger`}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition",
            activeCount > 0 || open
              ? "border-canopy/50 bg-canopy/10 text-canopy"
              : "border-line bg-surface text-ink/75 hover:border-canopy/35",
          )}
        >
          <ListFilter className="size-3.5" aria-hidden />
          Filters
          {activeCount > 0 ? (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-canopy px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
              {activeCount}
            </span>
          ) : null}
          <ChevronDown className="size-3.5 opacity-60" aria-hidden />
        </button>
      </div>
      {mounted && panel ? createPortal(panel, document.body) : null}
      <UpdateSavedSearchDialog
        open={confirmOpen}
        pending={saving}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void confirmUpdate()}
      />
    </>
  );
}
