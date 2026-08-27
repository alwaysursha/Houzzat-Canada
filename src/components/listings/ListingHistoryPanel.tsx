"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, X } from "lucide-react";
import type { PropertyType } from "@prisma/client";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { EmailVerificationRequired } from "@/components/auth/EmailVerificationRequired";
import { useLoginAgainLabel } from "@/components/auth/useLoginAgainLabel";
import { useTenantDisplayName } from "@/components/tenancy/TenantBrandProvider";
import { ListingSection } from "@/components/listings/ListingSection";
import {
  formatListPrice,
  propertyTypeLabel,
} from "@/lib/listings/constants";
import {
  compareHistoryRowsByRecency,
  isPriceChangeEvent,
  type HistoryRow,
} from "@/lib/listings/history-rows";
import { cn } from "@/lib/utils";

type Tab = "history" | "prices";

/** Compact ISO-style date for mobile history rows (matches reference). */
function formatDateCompact(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-CA");
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatHistoryPrice(
  row: HistoryRow,
  transactionType: string,
): string {
  if (
    isPriceChangeEvent(row.event) &&
    row.originalPrice != null &&
    row.price != null
  ) {
    return `${formatListPrice(row.originalPrice, transactionType)} → ${formatListPrice(row.price, transactionType)}`;
  }
  if (row.price != null) return formatListPrice(row.price, transactionType);
  return "—";
}

function priceChangeDelta(row: HistoryRow): {
  amount: number;
  percent: number | null;
} | null {
  if (row.originalPrice == null || row.price == null) return null;
  if (row.originalPrice === 0) return null;
  const amount = row.price - row.originalPrice;
  if (amount === 0) return null;
  const percent = (amount / row.originalPrice) * 100;
  if (!Number.isFinite(percent)) return null;
  return { amount, percent };
}

function formatSignedMoney(amount: number, transactionType: string) {
  const abs = formatListPrice(Math.abs(amount), transactionType);
  return amount > 0 ? `+${abs}` : `−${abs}`;
}

function formatSignedPercent(percent: number) {
  const abs = Math.abs(percent).toFixed(1);
  return percent > 0 ? `+${abs}%` : `−${abs}%`;
}

/** Soft status pill — history row.event is already a display label. */
function historyStatusPillClass(event: string) {
  const e = event.toLowerCase();
  if (/sold|leased/.test(e) && !/conditional|for\s/.test(e)) {
    return "bg-danger/10 text-danger";
  }
  if (/conditional/.test(e)) {
    return "bg-amber/15 text-amber";
  }
  if (/for sale|for lease|active/.test(e)) {
    return "bg-canopy/10 text-canopy";
  }
  // Terminated / Expired / Suspended / etc.
  return "bg-canopy/10 text-canopy";
}

function MobileHistoryCard({
  row,
  transactionType,
  locked,
  lockedHint,
  blurTitle,
  blurAria,
  showView,
}: {
  row: HistoryRow;
  transactionType: string;
  locked: boolean;
  lockedHint: string;
  blurTitle: string;
  blurAria: string;
  showView: boolean;
}) {
  const listDate = formatDateCompact(row.contractDate);
  const endDate = formatDateCompact(row.lastUpdate);
  const showEnd =
    Boolean(endDate) &&
    endDate !== listDate &&
    !/for sale|for lease/i.test(row.event);

  return (
    <article className="border-b border-line/70 py-4 last:border-b-0">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="text-lg font-bold leading-tight text-ink tabular-nums">
            {locked ? (
              <span className="text-sm font-semibold text-ink/45">
                {lockedHint}
              </span>
            ) : (
              formatHistoryPrice(row, transactionType)
            )}
          </p>
          <span
            className={cn(
              "inline-flex max-w-full shrink-0 truncate rounded-full px-2.5 py-0.5 text-xs font-semibold",
              historyStatusPillClass(row.event),
            )}
          >
            {row.event}
          </span>
        </div>
        {showView && !locked ? (
          <Link
            href={`/listing/${encodeURIComponent(row.listingId)}`}
            className="inline-flex h-11 shrink-0 items-center justify-center justify-self-end rounded-lg bg-canopy px-3.5 text-sm font-semibold text-white transition hover:bg-canopy-deep"
          >
            View
          </Link>
        ) : (
          <span className="size-0" aria-hidden />
        )}
        <p className="min-w-0 text-sm text-ink/50">
          {listDate ? (
            <>
              List: {listDate}
              {showEnd ? (
                <span className="text-ink/35">
                  {" "}
                  | End: {endDate}
                </span>
              ) : null}
            </>
          ) : (
            "—"
          )}
        </p>
        <p className="justify-self-end text-sm font-bold text-ink tabular-nums">
          {locked ? (
            <span
              className="inline-block select-none blur-[5px]"
              title={blurTitle}
              aria-label={blurAria}
            >
              {row.listingId}
            </span>
          ) : (
            row.listingId
          )}
        </p>
      </div>
    </article>
  );
}

function MobilePriceChangeCard({
  row,
  transactionType,
  locked,
  lockedHint,
  blurTitle,
  blurAria,
}: {
  row: HistoryRow;
  transactionType: string;
  locked: boolean;
  lockedHint: string;
  blurTitle: string;
  blurAria: string;
}) {
  const delta = !locked ? priceChangeDelta(row) : null;
  const up = delta != null && delta.amount > 0;
  const listDate = formatDateCompact(row.contractDate) ?? formatDateCompact(row.lastUpdate);

  return (
    <article className="border-b border-line/70 py-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
            historyStatusPillClass(row.event),
          )}
        >
          {row.event}
        </span>
        {listDate ? (
          <span className="text-sm text-ink/50">{listDate}</span>
        ) : null}
      </div>

      <div className="mt-2.5 min-w-0">
        {locked ? (
          <p className="text-sm font-semibold text-ink/45">{lockedHint}</p>
        ) : row.originalPrice != null && row.price != null ? (
          <p className="text-base font-bold leading-snug text-ink tabular-nums sm:text-lg">
            <span>{formatListPrice(row.originalPrice, transactionType)}</span>
            <span className="mx-1.5 font-semibold text-ink/35" aria-hidden>
              →
            </span>
            <span>{formatListPrice(row.price, transactionType)}</span>
          </p>
        ) : row.price != null ? (
          <p className="text-lg font-bold text-ink tabular-nums">
            {formatListPrice(row.price, transactionType)}
          </p>
        ) : (
          <p className="text-sm text-ink/45">—</p>
        )}
      </div>

      {delta ? (
        <p
          className={cn(
            "mt-2 inline-flex flex-wrap items-center gap-2 text-sm font-semibold",
            up ? "text-canopy" : "text-danger",
          )}
        >
          <span className="inline-flex items-center gap-1" aria-hidden>
            {up ? (
              <ArrowUp className="size-3.5" strokeWidth={2.5} />
            ) : (
              <ArrowDown className="size-3.5" strokeWidth={2.5} />
            )}
            <span className="tabular-nums">
              {formatSignedMoney(delta.amount, transactionType)}
            </span>
          </span>
          {delta.percent != null ? (
            <span className="tabular-nums text-ink/55">
              {formatSignedPercent(delta.percent)}
            </span>
          ) : null}
          <span className="sr-only">
            {up ? "Increased" : "Decreased"} by{" "}
            {formatSignedMoney(delta.amount, transactionType)}
            {delta.percent != null
              ? ` (${formatSignedPercent(delta.percent)})`
              : ""}
          </span>
        </p>
      ) : null}

      <p className="mt-2 text-right text-sm font-bold text-ink tabular-nums">
        {locked ? (
          <span
            className="inline-block select-none blur-[5px]"
            title={blurTitle}
            aria-label={blurAria}
          >
            {row.listingId}
          </span>
        ) : (
          row.listingId
        )}
      </p>
    </article>
  );
}

export function ListingHistoryPanel({
  mlsNumber,
  addressLabel,
  propertyType,
  transactionType,
  callbackPath,
  canSeeRestricted,
  signedIn: _signedIn,
  needsEmailVerification = false,
  rows: initialRows,
  enableAddressHistoryEnrich = false,
}: {
  mlsNumber?: string;
  addressLabel: string;
  propertyType: PropertyType | string;
  transactionType: "SALE" | "LEASE" | string;
  callbackPath: string;
  canSeeRestricted: boolean;
  /** @deprecated Access uses canSeeRestricted / needsEmailVerification. */
  signedIn: boolean;
  needsEmailVerification?: boolean;
  rows: HistoryRow[];
  /**
   * When true, pull PropTx sibling cycles after paint for any visitor.
   * Restricted prices/MLS#s still require canSeeRestricted to unblur.
   */
  enableAddressHistoryEnrich?: boolean;
}) {
  const { openAuth } = useAuthModal();
  const loginAgainLabel = useLoginAgainLabel("Sign in");
  const tenantName = useTenantDisplayName("Houzzat");
  const [tab, setTab] = useState<Tab>("history");
  const [expanded, setExpanded] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [rows, setRows] = useState(initialRows);
  const [enriching, setEnriching] = useState(false);
  const verifyTitleId = useId();

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!enableAddressHistoryEnrich || !mlsNumber) {
      return;
    }
    const mls = mlsNumber;
    let cancelled = false;
    const controller = new AbortController();

    async function enrich() {
      setEnriching(true);
      try {
        const res = await fetch(
          `/api/listings/${encodeURIComponent(mls)}/address-history/enrich`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
            signal: controller.signal,
          },
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { historyRows?: HistoryRow[] };
        if (!cancelled && Array.isArray(data.historyRows) && data.historyRows.length) {
          setRows(data.historyRows);
        }
      } catch {
        // Non-blocking — keep Neon rows
      } finally {
        if (!cancelled) setEnriching(false);
      }
    }

    void enrich();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enableAddressHistoryEnrich, mlsNumber]);

  useEffect(() => {
    if (!verifyOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setVerifyOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [verifyOpen]);

  const historyRows = useMemo(
    () => {
      if (rows.length === 0) return rows;
      const [current, ...rest] = rows;
      return [current, ...[...rest].sort(compareHistoryRowsByRecency)];
    },
    [rows],
  );

  const priceRows = useMemo(
    () =>
      rows
        .filter((row) => isPriceChangeEvent(row.event))
        .sort(compareHistoryRowsByRecency),
    [rows],
  );

  const activeRows = tab === "history" ? historyRows : priceRows;
  const visibleRows = expanded ? activeRows : activeRows.slice(0, 4);
  const needsToggle = activeRows.length > 4;
  const lockedHint = needsEmailVerification
    ? "(Email verification required)"
    : `(${loginAgainLabel} required)`;
  const hasRestrictedRows = activeRows.some((row) => !row.public);
  const blurTitle = needsEmailVerification
    ? "Email verification required"
    : "Sign in required";

  if (rows.length === 0 && !enriching) return null;

  const propertyLabel = propertyTypeLabel(propertyType as PropertyType);

  const vowFooter =
    !canSeeRestricted && hasRestrictedRows ? (
      <p className="mt-3 text-xs text-ink/50">
        {tab === "prices"
          ? "Price changes are restricted under TRREB VOW rules. "
          : "Past sold, leased, and expired prices and listing IDs are restricted under TRREB VOW rules. "}
        {needsEmailVerification ? (
          <>
            <button
              type="button"
              className="font-semibold text-canopy hover:underline"
              onClick={() => setVerifyOpen(true)}
            >
              Verify your email
            </button>{" "}
            to unlock {tab === "prices" ? "prices" : "full history"}.
          </>
        ) : (
          <>
            <button
              type="button"
              className="font-semibold text-canopy hover:underline"
              onClick={() =>
                openAuth({ mode: "sign-in", callbackUrl: callbackPath })
              }
            >
              {loginAgainLabel}
            </button>{" "}
            as a {tenantName} client to unlock{" "}
            {tab === "prices" ? "prices" : "full history"}.
          </>
        )}
      </p>
    ) : null;

  const verifyPortal =
    portalReady && verifyOpen
      ? createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center px-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby={verifyTitleId}
          >
            <button
              type="button"
              className="absolute inset-0 bg-ink/45"
              aria-label="Close"
              onClick={() => setVerifyOpen(false)}
            />
            <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/60 bg-white p-7 shadow-[0_28px_60px_-24px_rgba(0,0,0,0.55)] sm:p-9">
              <button
                type="button"
                onClick={() => setVerifyOpen(false)}
                className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-lg border border-line text-ink/70 transition hover:bg-mist"
                aria-label="Close"
              >
                <X className="size-4" aria-hidden />
              </button>
              <span id={verifyTitleId} className="sr-only">
                Email verification required
              </span>
              <EmailVerificationRequired
                variant="featured"
                icon="mail"
                eyebrow="Listing history"
                callbackUrl={callbackPath}
                title="Email verification required"
                body={
                  tab === "prices"
                    ? "Verify your email to unlock price changes for this home."
                    : "Verify your email to unlock full listing history."
                }
              />
            </div>
          </div>,
          document.body,
        )
      : null;

  const expandToggle = needsToggle ? (
    <button
      type="button"
      onClick={() => setExpanded((value) => !value)}
      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-canopy/30 bg-canopy/5 px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-canopy/10"
    >
      {expanded
        ? tab === "prices"
          ? "Less Price Changes"
          : "Less History"
        : tab === "prices"
          ? "View Full Price Changes"
          : "View Full History"}
      {expanded ? (
        <ChevronUp className="size-4 text-canopy" aria-hidden />
      ) : (
        <ChevronDown className="size-4 text-canopy" aria-hidden />
      )}
    </button>
  ) : null;

  if (rows.length === 0 && enriching) {
    return (
      <ListingSection
        id="listing-history"
        eyebrow="Record"
        title="Listing history"
        hint={`${transactionType === "LEASE" ? "Lease" : "Buy/sell"} history for ${addressLabel} (${propertyLabel})`}
        headerClassName="mb-3"
        action={
          <span className="text-xs font-medium text-ink/45">Updating history…</span>
        }
      >
        <p className="rounded-xl border border-line/70 bg-mist/40 px-4 py-5 text-center text-sm text-ink/55">
          Looking up prior listing cycles at this address…
        </p>
      </ListingSection>
    );
  }

  return (
    <ListingSection
      id="listing-history"
      eyebrow="Record"
      title="Listing history"
      hint={
        tab === "prices"
          ? `Price changes for ${addressLabel} (${propertyLabel})`
          : `${transactionType === "LEASE" ? "Lease" : "Buy/sell"} history for ${addressLabel} (${propertyLabel})`
      }
      headerClassName="mb-3"
      action={
        enriching ? (
          <span className="text-xs font-medium text-ink/45">Updating history…</span>
        ) : null
      }
    >
      <div
        className="mb-4 flex gap-1 border-b border-line/70 sm:gap-6"
        role="tablist"
        aria-label="Listing history"
      >
        {(
          [
            ["history", "Listing History"],
            ["prices", `Price Changes (${priceRows.length})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => {
              setTab(value);
              setExpanded(false);
            }}
            className={cn(
              "relative min-h-11 shrink-0 px-1 pb-3 text-sm font-semibold transition sm:px-0",
              tab === value ? "text-canopy" : "text-ink/45 hover:text-ink/70",
            )}
          >
            {label}
            {tab === value ? (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-canopy" />
            ) : null}
          </button>
        ))}
      </div>

      {tab === "prices" && priceRows.length === 0 ? (
        <p className="rounded-xl border border-line/70 bg-mist/40 px-4 py-5 text-center text-sm text-ink/55">
          No price changes on record for this listing.
        </p>
      ) : (
        <>
          {/* Mobile: stacked cards (no horizontal scroll) */}
          <div className="md:hidden">
            <div className="min-w-0">
              {visibleRows.map((row) => {
                const locked = !row.public && !canSeeRestricted;
                const blurAria = needsEmailVerification
                  ? "Listing ID hidden — email verification required"
                  : `Listing ID hidden — ${loginAgainLabel.toLowerCase()} required`;
                if (tab === "prices") {
                  return (
                    <MobilePriceChangeCard
                      key={row.id}
                      row={row}
                      transactionType={transactionType}
                      locked={locked}
                      lockedHint={lockedHint}
                      blurTitle={blurTitle}
                      blurAria={blurAria}
                    />
                  );
                }
                const showView = Boolean(
                  mlsNumber &&
                    row.listingId &&
                    row.listingId !== mlsNumber &&
                    !/^current-/i.test(row.id),
                );
                return (
                  <MobileHistoryCard
                    key={row.id}
                    row={row}
                    transactionType={transactionType}
                    locked={locked}
                    lockedHint={lockedHint}
                    blurTitle={blurTitle}
                    blurAria={blurAria}
                    showView={showView}
                  />
                );
              })}
            </div>
          </div>

          {/* Desktop / tablet: existing table */}
          <div className="hidden overflow-x-auto rounded-xl border border-line/70 md:block">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="bg-mist/80 text-[11px] uppercase tracking-wide text-ink/50">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Contract Date</th>
                  <th className="px-3 py-2.5 font-semibold">Last Update</th>
                  {tab === "prices" ? (
                    <>
                      <th className="px-3 py-2.5 font-semibold">
                        Original Price
                      </th>
                      <th className="px-3 py-2.5 font-semibold">New Price</th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-2.5 font-semibold">Price</th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                    </>
                  )}
                  <th className="px-3 py-2.5 font-semibold">Listing ID</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => {
                  const locked = !row.public && !canSeeRestricted;
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-t border-line/70",
                        index % 2 === 1 ? "bg-mist/40" : "bg-surface",
                      )}
                    >
                      <td className="px-3 py-3 text-ink/80">
                        {formatDate(row.contractDate)}
                      </td>
                      <td className="px-3 py-3 text-ink/80">
                        {formatDate(row.lastUpdate)}
                      </td>
                      {tab === "prices" ? (
                        <>
                          <td className="px-3 py-3 font-medium text-ink">
                            {locked ? (
                              <span className="text-ink/45">{lockedHint}</span>
                            ) : row.originalPrice != null ? (
                              formatListPrice(
                                row.originalPrice,
                                transactionType,
                              )
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-3 font-medium text-ink">
                            {locked ? (
                              <span className="text-ink/45">{lockedHint}</span>
                            ) : row.price != null ? (
                              formatListPrice(row.price, transactionType)
                            ) : (
                              "—"
                            )}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-3 font-medium text-ink">
                            {locked ? (
                              <span className="text-ink/45">{lockedHint}</span>
                            ) : (
                              formatHistoryPrice(row, transactionType)
                            )}
                          </td>
                          <td className="px-3 py-3 text-ink/80">{row.event}</td>
                        </>
                      )}
                      <td className="px-3 py-3 font-medium text-ink">
                        {locked ? (
                          <span
                            className="inline-block select-none blur-[5px]"
                            title={blurTitle}
                            aria-label={
                              needsEmailVerification
                                ? "Listing ID hidden — email verification required"
                                : `Listing ID hidden — ${loginAgainLabel.toLowerCase()} required`
                            }
                          >
                            {row.listingId}
                          </span>
                        ) : (
                          row.listingId
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {vowFooter}
          {verifyPortal}
          {expandToggle}
        </>
      )}
    </ListingSection>
  );
}
