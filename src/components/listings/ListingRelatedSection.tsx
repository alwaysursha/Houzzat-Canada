"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CompactPropertyCardRail } from "@/components/listings/CompactPropertyCardRail";
import { useListingAccountChrome } from "@/components/listings/ListingAccountChromeProvider";
import { ListingSection } from "@/components/listings/ListingSection";
import { propertyTypeLabel } from "@/lib/listings/constants";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import type { PropertyType } from "@prisma/client";
import { cn } from "@/lib/utils";

type RelatedMode = "same-area" | "same-features";
type RelatedTab = "for-sale" | "sold";
type RelatedPresentation = "controls" | "similar" | "comparable-sold";

const relatedResponseCache = new Map<string, ListingCardData[]>();

function relatedCacheKey(mlsNumber: string, mode: RelatedMode, tab: RelatedTab) {
  return `${mlsNumber}|${mode}|${tab}`;
}

type SubjectSummary = {
  mlsNumber: string;
  city: string;
  community: string | null;
  propertyType: PropertyType;
  beds: number;
  bedsLabel?: string | null;
  transactionType: "SALE" | "LEASE";
  segment: string;
};

function modeToPreference(mode: RelatedMode) {
  return mode === "same-features" ? "SAME_FEATURES" : "SAME_AREA";
}

function preferenceToMode(
  preference: "SAME_AREA" | "SAME_FEATURES" | null | undefined,
): RelatedMode {
  return preference === "SAME_FEATURES" ? "same-features" : "same-area";
}

export function ListingRelatedSection({
  subject,
  initialMode = "SAME_AREA",
  signedIn,
  presentation = "controls",
}: {
  subject: SubjectSummary;
  initialMode?: "SAME_AREA" | "SAME_FEATURES";
  signedIn: boolean;
  /** Locked panels do not write the user's Nearby/Similar preference. */
  presentation?: RelatedPresentation;
}) {
  const chrome = useListingAccountChrome();
  const locked = presentation !== "controls";
  const [tab, setTab] = useState<RelatedTab>(
    presentation === "comparable-sold" ? "sold" : "for-sale",
  );
  const [mode, setMode] = useState<RelatedMode>(
    locked ? "same-features" : preferenceToMode(initialMode),
  );
  const [items, setItems] = useState<ListingCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const userTouchedMode = useRef(false);

  useEffect(() => {
    if (locked) return;
    if (!chrome.active || !chrome.loaded || userTouchedMode.current) return;
    setMode(preferenceToMode(chrome.relatedListingsMode));
  }, [chrome.active, chrome.loaded, chrome.relatedListingsMode, locked]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const key = relatedCacheKey(subject.mlsNumber, mode, tab);
      const cached = relatedResponseCache.get(key);
      if (cached) {
        setItems(cached);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams({
          mlsNumber: subject.mlsNumber,
          mode,
          tab,
          limit: "12",
        });
        const res = await fetch(`/api/listings/related?${params.toString()}`, {
          signal,
        });
        const data = (await res.json()) as { items?: ListingCardData[] };
        const next = res.ok ? (data.items ?? []) : [];
        relatedResponseCache.set(key, next);
        setItems(next);
      } catch {
        if (signal?.aborted) return;
        setItems([]);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [subject.mlsNumber, mode, tab],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function selectMode(next: RelatedMode) {
    userTouchedMode.current = true;
    setMode(next);
    if (!signedIn) return;
    setSaving(true);
    try {
      await fetch("/api/account/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          relatedListingsMode: modeToPreference(next),
        }),
      });
    } finally {
      setSaving(false);
    }
  }

  const areaLabel = subject.community
    ? `${subject.community}, ${subject.city}`
    : subject.city;
  const bedsText =
    subject.bedsLabel?.trim() ||
    (Number.isInteger(subject.beds) ? String(subject.beds) : subject.beds.toFixed(1));
  const featuresLabel = `${propertyTypeLabel(subject.propertyType)} · ${bedsText} ${
    bedsText === "1" ? "bed" : "beds"
  }`;

  const seeAllHref = (() => {
    const params = new URLSearchParams();
    params.set("city", subject.city);
    if (subject.community) params.set("community", subject.community);
    if (tab === "sold") params.set("status", "SOLD");
    else {
      params.set("status", "ACTIVE");
      params.set("transactionType", subject.transactionType);
    }
    if (subject.segment) params.set("segment", subject.segment);
    if (mode === "same-features") {
      params.set("propertyType", subject.propertyType);
      params.set("minBeds", String(Math.floor(subject.beds)));
    }
    return `/search?${params.toString()}`;
  })();

  const forSaleLabel =
    subject.transactionType === "LEASE" ? "For lease" : "For sale";
  const recentClosedLabel =
    subject.transactionType === "LEASE" ? "Leased" : "Sold";
  const closedVerb =
    subject.transactionType === "LEASE" ? "leased" : "sold";
  const hint =
    mode === "same-features"
      ? tab === "sold"
        ? `Similar homes ${closedVerb} in ${areaLabel} · ${featuresLabel}`
        : `Similar homes ${subject.transactionType === "LEASE" ? "for lease" : "for sale"} in ${areaLabel} · ${featuresLabel}`
      : tab === "sold"
        ? `${recentClosedLabel} near ${areaLabel}`
        : `${forSaleLabel} near ${areaLabel}`;

  const sectionTitle =
    presentation === "similar"
      ? "Similar Homes"
      : presentation === "comparable-sold"
        ? subject.transactionType === "LEASE"
          ? "Comparable Leased"
          : "Comparable Sold"
        : "Explore nearby homes";
  const sectionId =
    presentation === "similar"
      ? "listing-similar"
      : presentation === "comparable-sold"
        ? "listing-comparable"
        : "listing-related";

  return (
    <ListingSection
      id={sectionId}
      className="w-full min-w-0"
      title={sectionTitle}
      hint={hint}
      action={
        <Link
          href={seeAllHref}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-canopy hover:underline"
        >
          View more
        </Link>
      }
    >
      {locked ? null : (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="inline-flex rounded-xl border border-line/50 bg-mist/35 p-1"
          role="group"
          aria-label="Match preference"
        >
          {(
            [
              { id: "same-area", label: "Nearby" },
              { id: "same-features", label: "Similar homes" },
            ] as const
          ).map((entry) => {
            const active = mode === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => void selectMode(entry.id)}
                className={cn(
                  "min-h-11 rounded-lg px-3 text-sm font-semibold transition",
                  active
                    ? "bg-surface text-ink shadow-[0_1px_0_rgb(20_32_28/0.04)]"
                    : "text-ink/55 hover:text-ink",
                )}
              >
                {entry.label}
              </button>
            );
          })}
        </div>

        <div
          role="tablist"
          aria-label="Related listings"
          className="flex gap-1 border-b border-line/50"
        >
          {(
            [
              { id: "for-sale", label: forSaleLabel },
              { id: "sold", label: recentClosedLabel },
            ] as const
          ).map((entry) => {
            const active = tab === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(entry.id)}
                className={cn(
                  "relative min-h-11 shrink-0 px-3 text-sm font-semibold transition",
                  active ? "text-ink" : "text-ink/45 hover:text-ink/70",
                )}
              >
                {entry.label}
                {active ? (
                  <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-canopy" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
      )}

      {saving ? (
        <p className="mt-2 text-xs text-ink/40">Saving preference…</p>
      ) : null}

      <div className="mt-4">
        {loading || items.length > 0 ? (
          <CompactPropertyCardRail
            items={items}
            loading={loading}
            label={hint}
          />
        ) : (
          <p className="rounded-xl border border-dashed border-line/70 bg-mist/40 px-4 py-8 text-center text-sm text-ink/50">
            {tab === "sold"
              ? mode === "same-features"
                ? `No recently ${closedVerb} homes with these features in this area.`
                : `No recently ${closedVerb} homes in this area yet.`
              : mode === "same-features"
                ? "No active listings with these features in this area."
                : "No other active listings in this area right now."}
          </p>
        )}
      </div>
    </ListingSection>
  );
}
