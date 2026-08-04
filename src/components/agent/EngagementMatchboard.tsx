"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ExternalLink,
  Loader2,
  Mail,
  Pencil,
  RefreshCw,
  X,
} from "lucide-react";
import {
  SearchCriteriaFields,
  criteriaSummaryChips,
  criteriaToQuery,
  parseCriteria,
  type CriteriaForm,
} from "@/components/agent/SearchCriteriaForm";
import { ListingPhoto } from "@/components/listings/ListingPhoto";
import type { BuyerIntentSnapshot } from "@/lib/agent/buyer-intent";
import {
  buyerIntentSearchName,
  buyerIntentToSavedQuery,
  hasUsableSearchCriteria,
  savedQueryToSearchHref,
} from "@/lib/agent/intent-to-search";
import {
  formatListPrice,
  formatListingAddressOneLine,
} from "@/lib/listings/constants";
import type { ListingCard as ListingCardData } from "@/lib/listings/types";
import { cn } from "@/lib/utils";

type SavedSearchRow = {
  id: string;
  name: string;
  emailAlerts: boolean;
  smsAlerts: boolean;
  query: unknown;
};

function intentToForm(intent: BuyerIntentSnapshot): CriteriaForm {
  return parseCriteria(buyerIntentToSavedQuery(intent.criteria));
}

export function EngagementMatchboard({
  leadId,
  buyerIntent,
  savedSearches,
  consented,
  customerEmail,
  onUpdated,
}: {
  leadId: string;
  buyerIntent: BuyerIntentSnapshot;
  savedSearches: SavedSearchRow[];
  consented: boolean;
  customerEmail?: string | null;
  onUpdated?: () => void;
}) {
  const primarySearch = savedSearches[0] ?? null;
  const canUseIntent = hasUsableSearchCriteria(buyerIntent.criteria);

  const seedQuery = useMemo(() => {
    if (primarySearch?.query) return primarySearch.query;
    return buyerIntentToSavedQuery(buyerIntent.criteria);
  }, [primarySearch, buyerIntent.criteria]);

  const [overrideQuery, setOverrideQuery] = useState<Record<
    string,
    unknown
  > | null>(null);
  const activeQuery = overrideQuery ?? seedQuery;

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<CriteriaForm>(() => parseCriteria(seedQuery));
  const [savePending, setSavePending] = useState(false);
  const [syncPending, setSyncPending] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [listings, setListings] = useState<ListingCardData[]>([]);
  const [loadState, setLoadState] = useState<
    "idle" | "loading" | "done" | "error"
  >("idle");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [emailPending, setEmailPending] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const searchHref = savedQueryToSearchHref(activeQuery);
  const activeForm = useMemo(
    () => parseCriteria(activeQuery),
    [activeQuery],
  );
  const displayChips = useMemo(() => {
    if (editing) return criteriaSummaryChips(form);
    if (overrideQuery || primarySearch) {
      return criteriaSummaryChips(activeForm);
    }
    return buyerIntent.chips;
  }, [
    editing,
    form,
    overrideQuery,
    primarySearch,
    activeForm,
    buyerIntent.chips,
  ]);

  const displaySummary = useMemo(() => {
    if (editing) {
      return "Editing match criteria — save to update Looking for and alerts.";
    }
    // After a manual save (or when a saved search exists), prose must match chips
    if (overrideQuery || primarySearch) {
      const c = activeForm;
      const place =
        c.communities
          .split(/[,|]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 2)
          .join(" and ") ||
        c.city.trim() ||
        null;
      const price =
        c.minPrice || c.maxPrice
          ? [
              c.minPrice
                ? `$${Number(c.minPrice.replace(/[^0-9]/g, "") || 0).toLocaleString("en-CA")}`
                : null,
              c.maxPrice
                ? `$${Number(c.maxPrice.replace(/[^0-9]/g, "") || 0).toLocaleString("en-CA")}`
                : null,
            ]
              .filter(Boolean)
              .join(" – ")
          : null;
      const bits = [
        c.transactionType === "LEASE"
          ? "set up for a lease"
          : "set up for a purchase",
        place ? `focused on ${place}` : null,
        c.propertyTypes.length
          ? `looking at ${c.propertyTypes
              .slice(0, 2)
              .map((t) => t.replaceAll("_", " ").toLowerCase())
              .join(" / ")}`
          : null,
        c.minBeds ? `needing ${c.minBeds}+ bedrooms` : null,
        price ? `in the ${price} range` : null,
      ].filter(Boolean);
      if (bits.length <= 1) return buyerIntent.summary;
      return `This client is ${bits.join(", ")}. From their saved search criteria.`;
    }
    return buyerIntent.summary;
  }, [
    editing,
    overrideQuery,
    primarySearch,
    activeForm,
    buyerIntent.summary,
  ]);

  const loadMatches = useCallback(async (query: unknown) => {
    setLoadState("loading");
    setEmailMsg(null);
    try {
      const href = savedQueryToSearchHref(query);
      const qs = href.includes("?") ? href.split("?")[1]! : "";
      const res = await fetch(`/api/listings/search?${qs}&limit=24`);
      if (!res.ok) {
        setLoadState("error");
        setListings([]);
        return;
      }
      const json = (await res.json()) as { items?: ListingCardData[] };
      setListings(json.items ?? []);
      setSelected(new Set());
      setLoadState("done");
    } catch {
      setLoadState("error");
      setListings([]);
    }
  }, []);

  useEffect(() => {
    const usable =
      Object.keys(
        (activeQuery && typeof activeQuery === "object"
          ? activeQuery
          : {}) as object,
      ).length > 0 ||
      canUseIntent ||
      Boolean(primarySearch);
    if (!usable) return;
    void loadMatches(activeQuery);
  }, [activeQuery, canUseIntent, primarySearch, loadMatches]);

  function startEdit() {
    setForm(parseCriteria(activeQuery));
    setEditing(true);
    setStatusMsg(null);
  }

  function cancelEdit() {
    setForm(parseCriteria(activeQuery));
    setEditing(false);
  }

  async function saveEditedCriteria() {
    setSavePending(true);
    setStatusMsg(null);
    try {
      const query = criteriaToQuery(form, activeQuery);
      const res = await fetch("/api/agent/searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          fromIntent: false,
          query,
          name:
            primarySearch?.name ||
            buyerIntentSearchName(buyerIntent.criteria) ||
            "Looking for search",
          searchId: primarySearch?.id,
          emailAlerts: primarySearch?.emailAlerts ?? true,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        created?: boolean;
      };
      if (!res.ok) {
        setStatusMsg(json.error || "Could not save criteria");
        return;
      }
      setOverrideQuery(query);
      setEditing(false);
      setStatusMsg(
        json.created
          ? "Criteria saved as a new search."
          : "Criteria updated on saved search.",
      );
      onUpdated?.();
    } finally {
      setSavePending(false);
    }
  }

  async function syncFromIntent() {
    setSyncPending(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/agent/searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          fromIntent: true,
          searchId: primarySearch?.id,
        }),
      });
      const json = (await res.json()) as { error?: string; created?: boolean };
      if (!res.ok) {
        setStatusMsg(json.error || "Could not sync from Looking for");
        return;
      }
      const next = buyerIntentToSavedQuery(buyerIntent.criteria);
      setOverrideQuery(next);
      setForm(intentToForm(buyerIntent));
      setEditing(false);
      setStatusMsg(
        json.created
          ? "Saved search created from Looking for."
          : "Saved search synced from Looking for.",
      );
      onUpdated?.();
    } finally {
      setSyncPending(false);
    }
  }

  function toggleMls(mls: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(mls)) next.delete(mls);
      else next.add(mls);
      return next;
    });
  }

  async function emailShortlist() {
    if (selected.size === 0) return;
    setEmailPending(true);
    setEmailMsg(null);
    setShareUrl(null);
    try {
      const res = await fetch("/api/agent/shortlist-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          mlsNumbers: [...selected],
          note: note.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        shareUrl?: string;
        stubbed?: boolean;
        count?: number;
      };
      if (!res.ok) {
        setEmailMsg(json.error || "Send failed");
        return;
      }
      setShareUrl(json.shareUrl ?? null);
      setEmailMsg(
        json.stubbed
          ? `Shortlist ready (email stubbed in dev). ${json.count} homes.`
          : `Emailed ${json.count} homes with share link.`,
      );
      onUpdated?.();
    } finally {
      setEmailPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#bae6fd] bg-gradient-to-br from-[#f0f9ff] to-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0284c7]">
              Match criteria
            </p>
            {!editing ? (
              <>
                <p className="mt-1 text-[13px] leading-relaxed text-[#334155]">
                  {displaySummary}
                </p>
                {displayChips.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {displayChips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[#0369a1] ring-1 ring-[#bae6fd]"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="mt-1 text-[12px] text-[#64748b]">
                Edit city, communities, budget, beds, and property types. Saving
                updates the lead’s saved search and refreshes matches.
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link
              href={
                editing ? savedQueryToSearchHref(criteriaToQuery(form)) : searchHref
              }
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#7dd3fc] bg-white px-3 py-2 text-[12px] font-semibold text-[#0369a1] hover:bg-[#e0f2fe]"
            >
              <ExternalLink className="size-3.5" />
              View all matches
            </Link>
            {!editing ? (
              <>
                <button
                  type="button"
                  onClick={startEdit}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#cbd5e1] bg-white px-3 py-2 text-[12px] font-semibold text-[#334155] hover:bg-[#f8fafc]"
                >
                  <Pencil className="size-3.5" />
                  Edit criteria
                </button>
                <button
                  type="button"
                  disabled={!canUseIntent || syncPending}
                  onClick={() => void syncFromIntent()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0284c7] px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
                >
                  {syncPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  {primarySearch ? "Reset from Looking for" : "Save Looking for"}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#cbd5e1] bg-white px-3 py-2 text-[12px] font-semibold text-[#64748b] hover:bg-[#f8fafc]"
                >
                  <X className="size-3.5" />
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savePending}
                  onClick={() => void saveEditedCriteria()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f766e] px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
                >
                  {savePending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : null}
                  Save criteria
                </button>
              </>
            )}
          </div>
        </div>

        {editing ? (
          <div className="mt-4 rounded-xl border border-[#e0f2fe] bg-white/90 p-3.5 sm:p-4">
            <SearchCriteriaFields
              form={form}
              onChange={setForm}
              compact
            />
          </div>
        ) : null}

        {statusMsg ? (
          <p className="mt-3 text-[12px] font-medium text-[#0f766e]">
            {statusMsg}
          </p>
        ) : null}
        {!canUseIntent && !primarySearch && !overrideQuery ? (
          <p className="mt-2 text-[12px] text-[#94a3b8]">
            Not enough browsing signal yet — use Edit criteria to set filters
            manually.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-semibold text-[#1e2a38]">
            Matching listings
          </h3>
          <p className="text-[12px] text-[#64748b]">
            Select homes to email as a shortlist with a shareable link.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            void loadMatches(
              editing ? criteriaToQuery(form, activeQuery) : activeQuery,
            )
          }
          disabled={loadState === "loading"}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#d8dee6] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#475569] hover:bg-[#f8fafc] disabled:opacity-50"
        >
          {loadState === "loading" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Refresh
        </button>
      </div>

      {loadState === "loading" && listings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#d8dee6] px-4 py-10 text-center text-[13px] text-[#94a3b8]">
          Loading matches…
        </p>
      ) : null}
      {loadState === "error" ? (
        <p className="rounded-lg border border-dashed border-[#fecdd3] bg-[#fff1f2] px-4 py-6 text-center text-[13px] text-[#be123c]">
          Could not load listings. Try View all matches.
        </p>
      ) : null}
      {loadState === "done" && listings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#d8dee6] px-4 py-10 text-center text-[13px] text-[#94a3b8]">
          No active listings match this criteria right now.
        </p>
      ) : null}

      {listings.length > 0 ? (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {listings.map((listing) => {
            const on = selected.has(listing.mlsNumber);
            return (
              <button
                key={listing.mlsNumber}
                type="button"
                onClick={() => toggleMls(listing.mlsNumber)}
                className={cn(
                  "flex gap-3 rounded-xl border p-2.5 text-left transition",
                  on
                    ? "border-[#2b6cb0] bg-[#eff6ff] ring-1 ring-[#2b6cb0]/30"
                    : "border-[#e2e8f0] bg-white hover:border-[#cbd5e1]",
                )}
              >
                <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-[#eef2f6]">
                  {listing.primaryImageUrl ? (
                    <ListingPhoto
                      src={listing.primaryImageUrl}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  ) : null}
                  <span
                    className={cn(
                      "absolute left-1 top-1 flex size-5 items-center justify-center rounded-full border bg-white",
                      on
                        ? "border-[#2b6cb0] text-[#2b6cb0]"
                        : "border-[#cbd5e1] text-transparent",
                    )}
                  >
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-[#1e2a38]">
                    {formatListingAddressOneLine(listing)}
                  </p>
                  <p className="mt-0.5 text-[13px] font-bold tabular-nums text-[#2b6cb0]">
                    {formatListPrice(listing.listPrice, listing.transactionType)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[#64748b]">
                    {listing.beds} bed · {listing.baths} bath · MLS{" "}
                    {listing.mlsNumber}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}

      {selected.size > 0 ? (
        <div className="sticky bottom-2 z-10 space-y-2 rounded-xl border border-[#2b6cb0]/25 bg-white/95 p-3 shadow-lg backdrop-blur-sm sm:bottom-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-[#1e2a38]">
              {selected.size} selected
            </p>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-[12px] font-medium text-[#64748b] hover:text-[#1e2a38]"
            >
              Clear
            </button>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Optional note for the lead…"
            className="w-full rounded-lg border border-[#d8dee6] px-3 py-2 text-[13px]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={emailPending || !consented || !customerEmail}
              onClick={() => void emailShortlist()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#2b6cb0] px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {emailPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Mail className="size-3.5" />
              )}
              Email shortlist
            </button>
            <span className="text-[11px] text-[#94a3b8]">
              {customerEmail || "No email"} ·{" "}
              {consented ? "CASL ok" : "Needs consent"}
            </span>
          </div>
          {emailMsg ? (
            <p className="text-[12px] font-medium text-[#0f766e]">{emailMsg}</p>
          ) : null}
          {shareUrl ? (
            <p className="break-all text-[12px] text-[#475569]">
              Share link:{" "}
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[#2b6cb0] hover:underline"
              >
                {shareUrl}
              </a>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
