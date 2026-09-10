/** Client/server-safe rail / hotness helpers. No Prisma. */

export const V2_RAIL_RESOURCE_KEY = "rail";

/** Same groupBy take as current Lead Profile first-paint hotness. */
export const V2_RAIL_VIEW_GROUP_TAKE = 40;

export type V2RailStamp = {
  leadId: string;
  epoch: number;
};

export function canApplyV2RailResponse(input: {
  stamp: V2RailStamp;
  current: V2RailStamp;
}): boolean {
  return (
    input.stamp.leadId === input.current.leadId &&
    input.stamp.epoch === input.current.epoch
  );
}

/** Exact current CustomerProfile relativeAgo used by Last Touch / Last Visit. */
export function formatV2RelativeAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(0, mins)} Min Ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} Hour${hours === 1 ? "" : "s"} Ago`;
  const days = Math.floor(hours / 24);
  return `${days} Day${days === 1 ? "" : "s"} Ago`;
}

/** Exact current identity-rail Last Visit header, including the Online suffix. */
export function formatV2LastVisitHeader(input: {
  lastSeenAt: string | null;
  isOnline: boolean;
}): string {
  return `${formatV2RelativeAgo(input.lastSeenAt)} (Last Visit)${input.isOnline ? " · Online" : ""}`;
}

/** Exact current blue-card tile order. Missing rail degrades to 0. */
export function v2RailBlueStatTiles(rail: {
  hot: { views24h: number };
  stats: { saves: number; alerts: number; emails: number };
} | null): Array<readonly [string, number]> {
  return [
    ["Views", rail?.hot.views24h ?? 0],
    ["Saves", rail?.stats.saves ?? 0],
    ["Alerts", rail?.stats.alerts ?? 0],
    ["Emails", rail?.stats.emails ?? 0],
  ];
}

/**
 * Exact current CustomerProfile ring formulas. Not LeadEmailLog open/click
 * rates. Repeat opens/clicks on a message do not change these values.
 */
export function v2EmailClickRate(input: {
  views24h: number;
  saves: number;
}): number {
  return Math.min(100, Math.round(input.views24h * 6 + input.saves * 10));
}

export function v2EmailOpenRate(input: {
  emails: number;
  hotness: number;
}): number {
  return Math.min(100, input.emails > 0 ? input.hotness : 0);
}

export function v2AlertOpenRate(input: { alerts: number }): number {
  return Math.min(100, input.alerts > 0 ? 40 + input.alerts * 8 : 0);
}

export function v2EmailRingRates(
  rail: {
    hot: { views24h: number; hotness: number };
    stats: { saves: number; alerts: number; emails: number };
  } | null,
): { clickRate: number; openRate: number; alertRate: number } {
  if (!rail) {
    return { clickRate: 0, openRate: 0, alertRate: 0 };
  }
  return {
    clickRate: v2EmailClickRate({
      views24h: rail.hot.views24h,
      saves: rail.stats.saves,
    }),
    openRate: v2EmailOpenRate({
      emails: rail.stats.emails,
      hotness: rail.hot.hotness,
    }),
    alertRate: v2AlertOpenRate({ alerts: rail.stats.alerts }),
  };
}
