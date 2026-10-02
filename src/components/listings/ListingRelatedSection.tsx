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
}: {
  subject: SubjectSummary;
  initialMode?: "SAME_AREA" | "SAME_FEATURES";
  signedIn: boolean;
}) {
  const chrome = useListingAccountChrome();
  const [tab, setTab] = useState<RelatedTab>("for-sale");
  const [mode, setMode] = useState<RelatedMode>(preferenceToMode(initialMode));
  const [items, setItems] = useState<ListingCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const userTouchedMode = useRef(false);

  useEffect(() => {
    if (!chrome.active || !chrome.loaded || userTouchedMode.current) return;
    setMode(preferenceToMode(chrome.relatedListingsMode));
  }, [chrome.active, chrome.loaded, chrome.relatedListingsMode]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
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
        setItems(res.ok ? (data.items ?? []) : []);
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
    subject.transactionType === "LEASE" ? "More for lease" : "More for sale";
  const recentClosedLabel =
    subject.transactionType === "LEASE" ? "Recent leased" : "Recent sold";
  const closedVerb =
    subject.transactionType === "LEASE" ? "leased" : "sold";

  return (
    <ListingSection
      id="listing-related"
      className="w-full min-w-0"
      eyebrow="Keep exploring"
      title="Related homes"
      hint={
        mode === "same-area"
          ? `Homes in ${areaLabel}`
          : `Similar homes in ${areaLabel} · ${featuresLabel}`
      }
      action={
        <Link
          href={seeAllHref}
          className="rounded-lg bg-canopy/10 px-3 py-2 text-xs font-semibold text-canopy transition hover:bg-canopy/15"
        >
          See all →
        </Link>
      }
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div
          role="tablist"
          aria-label="Related listings"
          className="flex gap-1 overflow-x-auto border-b border-line/70 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                  "-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold transition sm:px-4",
                  active
                    ? "border-canopy text-canopy-deep"
                    : "border-transparent text-ink/45 hover:text-ink/70",
                )}
              >
                {entry.label}
              </button>
            );
          })}
        </div>

        <div
          className="inline-flex rounded-xl border border-line/70 bg-mist/50 p-1"
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
                  "rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm",
                  active
                    ? "bg-canopy text-white shadow-sm"
                    : "text-ink/65 hover:text-canopy",
                )}
              >
                {entry.label}
              </button>
            );
          })}
        </div>
      </div>

      {saving ? (
        <p className="mt-2 text-xs text-ink/40">Saving preference…</p>
      ) : null}

      {mode === "same-features" ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-full border border-canopy/20 bg-canopy/5 px-2.5 py-1 text-[11px] font-semibold text-canopy-deep">
            {propertyTypeLabel(subject.propertyType)}
          </span>
          <span className="rounded-full border border-canopy/20 bg-canopy/5 px-2.5 py-1 text-[11px] font-semibold text-canopy-deep">
            {bedsText} {bedsText === "1" ? "bed" : "beds"}
          </span>
          <span className="rounded-full border border-line bg-mist/80 px-2.5 py-1 text-[11px] font-semibold text-ink/60">
            {areaLabel}
          </span>
        </div>
      ) : null}

      <div className="mt-4">
        {loading || items.length > 0 ? (
          <CompactPropertyCardRail
            items={items}
            loading={loading}
            label={`${forSaleLabel} and ${recentClosedLabel}`}
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
