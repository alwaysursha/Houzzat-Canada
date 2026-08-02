"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { PropertyType } from "@prisma/client";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
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
  signedIn,
  needsEmailVerification = false,
  rows,
}: {
  addressLabel: string;
  propertyType: PropertyType | string;
  transactionType: "SALE" | "LEASE" | string;
  callbackPath: string;
  canSeeRestricted: boolean;
  signedIn: boolean;
  needsEmailVerification?: boolean;
  rows: HistoryRow[];
}) {
  const { openAuth } = useAuthModal();
  const [tab, setTab] = useState<Tab>("history");
  const [expanded, setExpanded] = useState(false);

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
  const pricesLocked = tab === "prices" && !signedIn;

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

      {pricesLocked ? (
        <div className="rounded-xl border border-canopy/20 bg-canopy/5 px-4 py-6 text-center">
          <p className="text-sm text-ink/65">
            Sign in to view price changes for this home. Original and new prices
            come from the PropTx VOW feed once live.
          </p>
          <button
            type="button"
            className="mt-3 text-sm font-semibold text-canopy hover:underline"
            onClick={() =>
              openAuth({ mode: "sign-in", callbackUrl: callbackPath })
            }
          >
            Sign in to view price changes →
          </button>
        </div>
      ) : tab === "prices" && priceRows.length === 0 ? (
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
                            {row.originalPrice != null
                              ? formatListPrice(
                                  row.originalPrice,
                                  transactionType,
                                )
                              : "—"}
                          </td>
                          <td className="px-3 py-3 font-medium text-ink">
                            {row.price != null
                              ? formatListPrice(row.price, transactionType)
                              : "—"}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-3 font-medium text-ink">
                            {locked ? (
                              <span className="text-ink/45">
                                (Login to view)
                              </span>
                            ) : (
                              formatHistoryPrice(row, transactionType)
                            )}
                          </td>
                          <td className="px-3 py-3 text-ink/80">{row.event}</td>
                        </>
                      )}
                      <td className="px-3 py-3 font-medium text-ink">
                        {tab === "history" && locked ? (
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

          {tab === "history" &&
          !canSeeRestricted &&
          rows.some((row) => !row.public) ? (
            <p className="mt-3 text-xs text-ink/50">
              Past sold, leased, and expired prices and listing IDs are
              restricted under TRREB VOW rules.{" "}
              {needsEmailVerification ? (
                <>
                  <Link
                    href={`/auth/verify-email?callbackUrl=${encodeURIComponent(callbackPath)}`}
                    className="font-semibold text-canopy hover:underline"
                  >
                    Verify your email
                  </Link>{" "}
                  to unlock full history.
                </>
              ) : (
                <>
                  <Link
                    href={`/auth/sign-in?callbackUrl=${encodeURIComponent(callbackPath)}`}
                    className="font-semibold text-canopy hover:underline"
                  >
                    Sign in
                  </Link>{" "}
                  as a Houzzat client to unlock full history.
                </>
              )}
            </p>
          ) : null}

          {tab === "prices" ? (
            <p className="mt-3 text-xs text-ink/45">
              Original and new prices will sync from the PropTx VOW feed when
              credentials are live.
            </p>
          ) : null}

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
