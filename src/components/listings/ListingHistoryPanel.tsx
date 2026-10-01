"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowDown, ArrowUp, X } from "lucide-react";
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

function HistoryTimelineItem({
  row,
  transactionType,
  tab,
  locked,
  lockedHint,
  blurTitle,
  blurAria,
  showView,
  isLast,
}: {
  row: HistoryRow;
  transactionType: string;
  tab: Tab;
  locked: boolean;
  lockedHint: string;
  blurTitle: string;
  blurAria: string;
  showView: boolean;
  isLast: boolean;
}) {
  const delta = tab === "prices" && !locked ? priceChangeDelta(row) : null;
  const up = delta != null && delta.amount > 0;
  const lastUpdate = row.lastUpdate ? formatDate(row.lastUpdate) : null;

  return (
    <li className="flex gap-3">
      <div className="flex w-3 shrink-0 flex-col items-center" aria-hidden>
        <span className="mt-1.5 size-2 rounded-full bg-canopy/70" />
        {isLast ? null : <span className="mt-1 w-px flex-1 bg-line/60" />}
      </div>
      <div className={cn("min-w-0 flex-1", isLast ? "pb-1" : "pb-5")}>
        <div className="flex items-start justify-between gap-3">
          <p className="font-sans text-base font-semibold text-ink">{row.event}</p>
          {showView && !locked ? (
            <Link
              href={`/listing/${encodeURIComponent(row.listingId)}`}
              className="inline-flex h-11 shrink-0 items-center text-sm font-semibold text-canopy hover:underline"
            >
              View
            </Link>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-ink/55">{formatDate(row.contractDate)}</p>
        {lastUpdate ? (
          <p className="mt-0.5 text-xs text-ink/45">Last update {lastUpdate}</p>
        ) : null}
        <div className="mt-2">
          {locked ? (
            <p className="text-sm font-semibold text-ink/45">{lockedHint}</p>
          ) : tab === "prices" ? (
            row.originalPrice != null || row.price != null ? (
              <p className="font-sans text-lg font-semibold text-ink">
                {row.originalPrice != null
                  ? formatListPrice(row.originalPrice, transactionType)
                  : "—"}
                <span className="mx-1.5 font-medium text-ink/35" aria-hidden>
                  →
                </span>
                {row.price != null
                  ? formatListPrice(row.price, transactionType)
                  : "—"}
              </p>
            ) : (
              <p className="text-sm text-ink/45">—</p>
            )
          ) : (
            <p className="font-sans text-lg font-semibold text-ink">
              {formatHistoryPrice(row, transactionType)}
            </p>
          )}
        </div>
        {delta ? (
          <p
            className={cn(
              "mt-1 inline-flex flex-wrap items-center gap-2 text-sm font-semibold",
              up ? "text-canopy" : "text-danger",
            )}
          >
            <span className="inline-flex items-center gap-1" aria-hidden>
              {up ? (
                <ArrowUp className="size-3.5" strokeWidth={2.5} />
              ) : (
                <ArrowDown className="size-3.5" strokeWidth={2.5} />
              )}
              <span>{formatSignedMoney(delta.amount, transactionType)}</span>
            </span>
            {delta.percent != null ? (
              <span className="text-ink/55">{formatSignedPercent(delta.percent)}</span>
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
        <p className="mt-2 text-sm font-medium text-ink">
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
    </li>
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
      className="mt-2 inline-flex min-h-11 w-full items-center justify-center text-sm font-semibold text-canopy transition hover:underline"
      aria-expanded={expanded}
    >
      {expanded
        ? tab === "prices"
          ? "Show less price changes"
          : "Show less history"
        : tab === "prices"
          ? "View full price changes"
          : "View full listing history"}
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
          <ol className="min-w-0">
            {visibleRows.map((row, index) => {
              const locked = !row.public && !canSeeRestricted;
              const blurAria = needsEmailVerification
                ? "Listing ID hidden — email verification required"
                : `Listing ID hidden — ${loginAgainLabel.toLowerCase()} required`;
              const showView = Boolean(
                tab === "history" &&
                  mlsNumber &&
                  row.listingId &&
                  row.listingId !== mlsNumber &&
                  !/^current-/i.test(row.id),
              );
              return (
                <HistoryTimelineItem
                  key={row.id}
                  row={row}
                  transactionType={transactionType}
                  tab={tab}
                  locked={locked}
                  lockedHint={lockedHint}
                  blurTitle={blurTitle}
                  blurAria={blurAria}
                  showView={showView}
                  isLast={index === visibleRows.length - 1}
                />
              );
            })}
          </ol>
          {vowFooter}
          {verifyPortal}
          {expandToggle}
        </>
      )}
    </ListingSection>
  );
}
