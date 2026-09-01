/**
 * Stage 4.9 — unwrap Mobile v2 engagement API responses.
 */

import type { MobileLeadEngagement } from "../types/api";

export function unwrapEngagement(data: unknown): MobileLeadEngagement | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const engagement =
    root.engagement && typeof root.engagement === "object"
      ? (root.engagement as Record<string, unknown>)
      : null;
  if (!engagement) return null;

  const hot =
    engagement.hot && typeof engagement.hot === "object"
      ? (engagement.hot as Record<string, unknown>)
      : null;
  const stats =
    engagement.stats && typeof engagement.stats === "object"
      ? (engagement.stats as Record<string, unknown>)
      : null;
  const rings =
    engagement.rings && typeof engagement.rings === "object"
      ? (engagement.rings as Record<string, unknown>)
      : null;
  const buyerIntent =
    engagement.buyerIntent && typeof engagement.buyerIntent === "object"
      ? (engagement.buyerIntent as Record<string, unknown>)
      : null;

  if (!hot || !stats || !rings || !buyerIntent) return null;

  const num = (v: unknown, fallback = 0) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  const bool = (v: unknown) => v === true;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const strOrNull = (v: unknown) =>
    typeof v === "string" ? v : v === null ? null : null;

  const mapMlsRows = (key: string) => {
    const rows = engagement[key];
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === "object"))
      .map((r) => ({
        id: str(r.id),
        mlsNumber: str(r.mlsNumber),
        ...(key === "listingNotes" ? { body: str(r.body) } : {}),
        ...(key === "areaMonitors"
          ? { name: str(r.name), city: str(r.city) }
          : {}),
      }));
  };

  const savedSearches = Array.isArray(engagement.savedSearches)
    ? engagement.savedSearches
        .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === "object"))
        .map((r) => ({
          id: str(r.id),
          name: str(r.name),
          emailAlerts: bool(r.emailAlerts),
          smsAlerts: bool(r.smsAlerts),
          isHomepageActive: bool(r.isHomepageActive),
          query: r.query ?? null,
        }))
    : [];

  const tours = Array.isArray(engagement.tours)
    ? engagement.tours
        .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === "object"))
        .map((r) => ({
          id: str(r.id),
          name: str(r.name),
          status: str(r.status),
          stops: Array.isArray(r.stops)
            ? r.stops
                .filter((s): s is Record<string, unknown> =>
                  Boolean(s && typeof s === "object"),
                )
                .map((s) => ({ mlsNumber: str(s.mlsNumber) }))
            : [],
        }))
    : [];

  const alerts = Array.isArray(engagement.alerts)
    ? engagement.alerts
        .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === "object"))
        .map((r) => ({
          id: str(r.id),
          title: str(r.title),
          kind: str(r.kind),
        }))
    : [];

  const matches = Array.isArray(engagement.matches)
    ? engagement.matches
        .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === "object"))
        .map((r) => ({
          mlsNumber: str(r.mlsNumber),
          address: str(r.address),
          listPrice:
            typeof r.listPrice === "number" && Number.isFinite(r.listPrice)
              ? r.listPrice
              : null,
          bedsLabel: strOrNull(r.bedsLabel),
          imageUrl: strOrNull(r.imageUrl),
        }))
    : [];

  return {
    hot: {
      hotness: num(hot.hotness),
      views24h: num(hot.views24h),
      distinctListings24h: num(hot.distinctListings24h),
      isOnline: bool(hot.isOnline),
      binge: bool(hot.binge),
      lastSeenAt: strOrNull(hot.lastSeenAt),
    },
    stats: {
      saves: num(stats.saves),
      alerts: num(stats.alerts),
      emails: num(stats.emails),
      savedSearchCount: num(stats.savedSearchCount),
    },
    lastTouchAt: str(engagement.lastTouchAt),
    rings: {
      emailOpens: num(rings.emailOpens),
      emailClicks: num(rings.emailClicks),
      alertOpens: num(rings.alertOpens),
    },
    buyerIntent: {
      summary: str(buyerIntent.summary),
      chips: Array.isArray(buyerIntent.chips)
        ? buyerIntent.chips.filter((c): c is string => typeof c === "string")
        : [],
      source: str(buyerIntent.source),
      sourceLabel: str(buyerIntent.sourceLabel),
      headline: strOrNull(buyerIntent.headline),
    },
    savedSearches,
    savedListings: mapMlsRows("savedListings") as MobileLeadEngagement["savedListings"],
    propertyMonitors: mapMlsRows("propertyMonitors") as MobileLeadEngagement["propertyMonitors"],
    areaMonitors: mapMlsRows("areaMonitors") as MobileLeadEngagement["areaMonitors"],
    listingNotes: mapMlsRows("listingNotes") as MobileLeadEngagement["listingNotes"],
    tours,
    alerts,
    matches,
    matchesLoaded: engagement.matchesLoaded !== false,
  };
}
