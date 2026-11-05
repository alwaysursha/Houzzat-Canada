"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { formatListPrice } from "@/lib/listings/constants";
import type { HistoryRow } from "@/lib/listings/history-rows";
import { listingPath } from "@/lib/listings/listing-path";
import type { ListingInsightsPayload } from "@/lib/market/listing-insights";
import type { ListingCard } from "@/lib/listings/types";
import styles from "./royal-property.module.css";

type RecordedOpenHouse = {
  startsAt: string;
  endsAt: string;
  notes?: string | null;
};

type NearbyItem = {
  id: string;
  type: string;
  name: string;
  distanceKm: number;
};

const AMENITY_TYPES = ["SCHOOL", "PARK", "TRANSIT", "GROCERY"] as const;

const AMENITY_LABEL: Record<string, string> = {
  SCHOOL: "Schools",
  PARK: "Parks",
  TRANSIT: "Transit",
  GROCERY: "Grocery",
};

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "America/Toronto",
  });
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

function formatShowing(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime())) return "Time on file";
  const day = start.toLocaleString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
  });
  if (Number.isNaN(end.getTime())) return day;
  const finish = end.toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
  });
  return `${day} – ${finish}`;
}

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.block} id={id} aria-labelledby={`${id}-title`}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2 id={`${id}-title`}>{title}</h2>
      {children}
    </section>
  );
}

/** Same window as the rooms-open-houses API: keep an event only while endsAt >= now. */
function currentOpenHouses(rows: RecordedOpenHouse[]): RecordedOpenHouse[] {
  const now = Date.now();
  return rows.filter((row) => new Date(row.endsAt).getTime() >= now);
}

function OpenHouseList({
  rows,
  demonstration,
}: {
  rows: RecordedOpenHouse[];
  demonstration: boolean;
}) {
  const current = currentOpenHouses(rows);
  if (current.length === 0) return null;
  return (
    <Section id="listing-open-houses" eyebrow="Showings" title="Open houses">
      <ul className={styles.openList}>
        {current.map((row) => (
          <li key={`${row.startsAt}-${row.endsAt}`}>
            <strong>{formatShowing(row.startsAt, row.endsAt)}</strong>
            {row.notes ? <span>{row.notes}</span> : null}
          </li>
        ))}
      </ul>
      {demonstration ? (
        <p className={styles.intelNote}>
          These times are part of the demonstration record. They are not a public showing.
        </p>
      ) : null}
    </Section>
  );
}

function HistoryList({
  rows,
  transactionType,
  canSeeRestricted,
}: {
  rows: HistoryRow[];
  transactionType: string;
  canSeeRestricted: boolean;
}) {
  const visible = rows.filter((row) => row.event.trim().length > 0);
  if (visible.length === 0) return null;
  const withheld = !canSeeRestricted && visible.some((row) => !row.public);
  return (
    <Section id="listing-history" eyebrow="Record" title="Listing history">
      <ul className={styles.historyList}>
        {visible.map((row) => {
          const showPrice = (row.public || canSeeRestricted) && row.price != null;
          return (
            <li key={row.id} className={styles.historyRow}>
              <span>{formatWhen(row.contractDate ?? row.lastUpdate)}</span>
              <strong>{row.event}</strong>
              <span>
                {showPrice
                  ? formatListPrice(row.price as number, transactionType)
                  : "—"}
              </span>
            </li>
          );
        })}
      </ul>
      {withheld ? (
        <p className={styles.intelNote}>
          Sold prices and other restricted history stay with registered clients of this brokerage.
        </p>
      ) : null}
    </Section>
  );
}

function PriceTrack({
  listPrice,
  medianAsk,
}: {
  listPrice: number;
  medianAsk: number | null;
}) {
  if (medianAsk == null || medianAsk <= 0 || listPrice <= 0) return null;
  const min = Math.min(listPrice, medianAsk) * 0.92;
  const max = Math.max(listPrice, medianAsk) * 1.08;
  const span = Math.max(max - min, 1);
  const listPct = ((listPrice - min) / span) * 100;
  const askPct = ((medianAsk - min) / span) * 100;
  return (
    <div
      className={styles.priceTrack}
      role="img"
      aria-label={`List price ${formatListPrice(listPrice)} compared with the area median ask of ${formatListPrice(medianAsk)}.`}
    >
      <span className={styles.priceMark} style={{ left: `${askPct}%` }} />
      <span className={styles.priceMarkList} style={{ left: `${listPct}%` }} />
      <p>
        <span>Area ask {formatListPrice(medianAsk)}</span>
        <span>This home {formatListPrice(listPrice)}</span>
      </p>
    </div>
  );
}

export type RoyalCollectionIntelligenceInput = {
  demonstration: boolean;
  mlsNumber: string;
  lat: number;
  lng: number;
  canSeeRestricted: boolean;
  historyRows: HistoryRow[];
  transactionType: "SALE" | "LEASE";
  recordedOpenHouses: RecordedOpenHouse[];
};

/**
 * Royal Collection property intelligence.
 * Live listings use the existing insights, nearby, related, and open-house APIs.
 * Demonstration listings do not request market history, estimates, or comparisons.
 */
export function RoyalCollectionPropertyIntelligence({
  demonstration,
  mlsNumber,
  lat,
  lng,
  canSeeRestricted,
  historyRows,
  transactionType,
  recordedOpenHouses,
}: RoyalCollectionIntelligenceInput) {
  const [insights, setInsights] = useState<ListingInsightsPayload | null>(null);
  const [insightsUnavailable, setInsightsUnavailable] = useState(false);
  const [nearby, setNearby] = useState<NearbyItem[]>([]);
  const [amenityFilter, setAmenityFilter] = useState<string[]>([...AMENITY_TYPES]);
  const [similar, setSimilar] = useState<ListingCard[]>([]);
  const [openHouses, setOpenHouses] = useState<RecordedOpenHouse[]>(
    demonstration ? recordedOpenHouses : [],
  );

  useEffect(() => {
    if (demonstration) return;
    const controller = new AbortController();
    const mls = encodeURIComponent(mlsNumber);

    async function load() {
      const [insightRes, nearbyRes, relatedRes, showingRes] = await Promise.all([
        fetch(`/api/listings/${mls}/insights`, {
          signal: controller.signal,
          cache: "no-store",
          credentials: "same-origin",
        }),
        Number.isFinite(lat) && Number.isFinite(lng)
          ? fetch(`/api/nearby?lat=${lat}&lng=${lng}&radius=2`, {
              signal: controller.signal,
            })
          : Promise.resolve(null),
        fetch(
          `/api/listings/related?mlsNumber=${mls}&mode=same-area&tab=for-sale&limit=8`,
          { signal: controller.signal, credentials: "same-origin" },
        ),
        fetch(`/api/listings/${mls}/rooms-open-houses`, {
          signal: controller.signal,
          credentials: "same-origin",
        }),
      ]);

      if (insightRes.ok) {
        const body = (await insightRes.json()) as { insights?: ListingInsightsPayload };
        setInsights(body.insights ?? null);
        setInsightsUnavailable(!body.insights);
      } else {
        setInsights(null);
        setInsightsUnavailable(true);
      }

      if (nearbyRes?.ok) {
        const body = (await nearbyRes.json()) as { items?: NearbyItem[] };
        setNearby(Array.isArray(body.items) ? body.items : []);
      }

      if (relatedRes.ok) {
        const body = (await relatedRes.json()) as { items?: ListingCard[] };
        setSimilar(Array.isArray(body.items) ? body.items : []);
      }

      if (showingRes.ok) {
        const body = (await showingRes.json()) as {
          openHouses?: RecordedOpenHouse[];
        };
        setOpenHouses(Array.isArray(body.openHouses) ? body.openHouses : []);
      }
    }

    void load().catch(() => {
      if (!controller.signal.aborted) setInsightsUnavailable(true);
    });
    return () => controller.abort();
  }, [canSeeRestricted, demonstration, lat, lng, mlsNumber]);

  if (demonstration) {
    return (
      <div className={styles.intelligence}>
        <Section
          id="listing-insights"
          eyebrow="Intelligence"
          title="Market record"
        >
          <p>
            Listing history, market insights, estimated value, and nearby comparisons stay off this demonstration property. They are not calculated from sample inventory.
          </p>
        </Section>
        <OpenHouseList rows={recordedOpenHouses} demonstration />
      </div>
    );
  }

  const valuation = insights?.valuation;
  const showEstimate =
    valuation != null &&
    (valuation.restricted ||
      valuation.status === "INSUFFICIENT_DATA" ||
      valuation.mid != null);
  const amenities = nearby.filter((item) => amenityFilter.includes(item.type));
  const soldRestricted = insights?.pricePosition.soldRestricted !== false;

  return (
    <div className={styles.intelligence}>
      {insightsUnavailable && !insights ? (
        <Section id="listing-insights" eyebrow="Intelligence" title="Market record">
          <p className={styles.intelNote}>
            {historyRows.length > 0
              ? "Market insights and estimated value appear when this workspace is authorized for the listing's board inventory."
              : "Listing history, market insights, and estimated value appear when this workspace is authorized for the listing's board inventory."}
          </p>
        </Section>
      ) : null}

      <HistoryList
        rows={historyRows}
        transactionType={transactionType}
        canSeeRestricted={canSeeRestricted}
      />

      {insights ? (
        <Section id="listing-market" eyebrow="Neighbourhood" title="Market insights">
          <p>{insights.temperature.summary}</p>
          <dl className={styles.intelStats}>
            <div>
              <dt>Conditions</dt>
              <dd>{insights.temperature.label}</dd>
            </div>
            <div>
              <dt>Days on market</dt>
              <dd>{insights.timing.daysOnMarket}</dd>
            </div>
            <div>
              <dt>Active nearby</dt>
              <dd>{insights.pulse.activeCount}</dd>
            </div>
            {!soldRestricted && insights.pulse.soldCount > 0 ? (
              <div>
                <dt>Recent sales</dt>
                <dd>{insights.pulse.soldCount}</dd>
              </div>
            ) : null}
          </dl>
          <PriceTrack
            listPrice={insights.pricePosition.listPrice}
            medianAsk={insights.pricePosition.medianAsk}
          />
        </Section>
      ) : null}

      {showEstimate && valuation ? (
        <Section id="listing-estimated-value" eyebrow="Estimate" title="Estimated value">
          {valuation.restricted ? (
            <p className={styles.intelNote}>
              An estimated value uses sold comparables and is available to registered clients of this brokerage.
            </p>
          ) : valuation.status === "OK" && valuation.mid != null ? (
            <>
              <p className={styles.estimateFigure}>{formatListPrice(valuation.mid, transactionType)}</p>
              {valuation.low != null && valuation.high != null ? (
                <p className={styles.intelNote}>
                  Range {formatListPrice(valuation.low, transactionType)} – {formatListPrice(valuation.high, transactionType)}
                </p>
              ) : null}
              <p className={styles.intelNote}>{valuation.disclaimer}</p>
            </>
          ) : (
            <p className={styles.intelNote}>{valuation.disclaimer}</p>
          )}
        </Section>
      ) : null}

      {amenities.length > 0 || nearby.length > 0 ? (
        <Section id="listing-nearby" eyebrow="Neighbourhood" title="Nearby">
          <div className={styles.amenityFilters}>
            {AMENITY_TYPES.map((type) => {
              const on = amenityFilter.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setAmenityFilter((current) =>
                      current.includes(type)
                        ? current.filter((item) => item !== type)
                        : [...current, type],
                    )
                  }
                >
                  {AMENITY_LABEL[type]}
                </button>
              );
            })}
          </div>
          <ul className={styles.amenityList}>
            {amenities.map((item) => (
              <li key={item.id}>
                <span>{AMENITY_LABEL[item.type] ?? "Amenity"}</span>
                <strong>{item.name}</strong>
                <span>{formatDistance(item.distanceKm)}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {similar.length > 0 ? (
        <Section id="listing-related" eyebrow="Inventory" title="Similar properties">
          <ul className={styles.similarGrid}>
            {similar.map((item) => {
              const href = listingPath({
                mlsNumber: item.mlsNumber,
                addressLine: item.addressLine,
                city: item.city,
                unitNumber: item.unitNumber,
                province: item.province,
                postalCode: item.postalCode,
              });
              return (
                <li key={item.mlsNumber}>
                  <Link href={href}>
                    {item.primaryImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.primaryImageUrl} alt="" />
                    ) : (
                      <span className={styles.relatedEmpty} />
                    )}
                    <strong>{item.addressLine}</strong>
                    <span>
                      {item.city}
                      {item.listPrice > 0
                        ? ` · ${formatListPrice(item.listPrice, item.transactionType)}`
                        : ""}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      <OpenHouseList rows={openHouses} demonstration={false} />
    </div>
  );
}
