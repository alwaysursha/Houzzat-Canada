"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import type { PropertyType } from "@prisma/client";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { EmailVerificationRequired } from "@/components/auth/EmailVerificationRequired";
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

export function ListingHistoryPanel({
  addressLabel,
  propertyType,
  transactionType,
  callbackPath,
  canSeeRestricted,
  signedIn: _signedIn,
  needsEmailVerification = false,
  rows,
}: {
  addressLabel: string;
  propertyType: PropertyType | string;
  transactionType: "SALE" | "LEASE" | string;
  callbackPath: string;
  canSeeRestricted: boolean;
  /** @deprecated Access uses canSeeRestricted / needsEmailVerification. */
  signedIn: boolean;
  needsEmailVerification?: boolean;
  rows: HistoryRow[];
}) {
  const { openAuth } = useAuthModal();
  const [tab, setTab] = useState<Tab>("history");
  const [expanded, setExpanded] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const verifyTitleId = useId();

  useEffect(() => {
    setPortalReady(true);
  }, []);

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
    : "(Sign in required)";
  const hasRestrictedRows = activeRows.some((row) => !row.public);

  if (rows.length === 0) return null;

  const propertyLabel = propertyTypeLabel(propertyType as PropertyType);

  return (
    <ListingSection
      eyebrow="Record"
      title="Listing history"
      hint={
        tab === "prices"
          ? `Price changes for ${addressLabel} (${propertyLabel})`
          : `${transactionType === "LEASE" ? "Lease" : "Buy/sell"} history for ${addressLabel} (${propertyLabel})`
      }
      headerClassName="mb-3"
    >
      <div className="mb-4 flex gap-6 border-b border-line/70">
        {(
          [
            ["history", "Listing History"],
            ["prices", `Price Changes (${priceRows.length})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setTab(value);
              setExpanded(false);
            }}
            className={cn(
              "relative pb-3 text-sm font-semibold transition",
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
          <div className="overflow-x-auto rounded-xl border border-line/70">
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
                            title={
                              needsEmailVerification
                                ? "Email verification required"
                                : "Sign in required"
                            }
                            aria-label={
                              needsEmailVerification
                                ? "Listing ID hidden — email verification required"
                                : "Listing ID hidden — sign in required"
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

          {!canSeeRestricted && hasRestrictedRows ? (
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
                    Sign in
                  </button>{" "}
                  as a Houzzat client to unlock{" "}
                  {tab === "prices" ? "prices" : "full history"}.
                </>
              )}
            </p>
          ) : null}

          {portalReady && verifyOpen
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
            : null}

          {needsToggle ? (
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
          ) : null}
        </>
      )}
    </ListingSection>
  );
}
