/**
 * Public neighbourhood stats for /property/{slug}.
 * Authorized ACTIVE residential SALE listings only — never sold/VOW fields.
 */

import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildPrismaEntitledInventoryWhere,
  type WorkspaceListingEntitlement,
} from "@/lib/tenancy/listing-entitlement";
import { excludeStagingSnapshotWhere } from "@/lib/tenancy/templates/high-octane-staging-snapshot";

export type NeighbourhoodInsightsScope = "community" | "municipality";

export type NeighbourhoodInsights = {
  scope: NeighbourhoodInsightsScope;
  /** Human label: community name or city. */
  placeLabel: string;
  city: string;
  community: string | null;
  activeCount: number;
  medianAskingPrice: number | null;
  avgDaysOnMarket: number | null;
  /** True when there is nothing useful to show. */
  empty: boolean;
  sampleNote: string;
};

export type ActiveListingStatRow = {
  listPrice: number;
  daysOnMarket: number;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}

/**
 * Pure — build insights from entitled active rows (tests).
 * Never invents stats; community must be caller-supplied (verified), never inferred.
 */
export function buildNeighbourhoodInsightsFromActives(input: {
  city: string;
  community?: string | null;
  rows: ActiveListingStatRow[];
}): NeighbourhoodInsights {
  const city = input.city.trim();
  const community = input.community?.trim() || null;
  const scope: NeighbourhoodInsightsScope = community
    ? "community"
    : "municipality";
  const placeLabel = community || city;
  const activeCount = input.rows.length;
  const medianAskingPrice = median(input.rows.map((r) => r.listPrice));
  const avgDaysOnMarket =
    activeCount > 0
      ? Math.round(
          input.rows.reduce((n, r) => n + r.daysOnMarket, 0) / activeCount,
        )
      : null;
  const empty = !city || activeCount === 0;

  return {
    scope,
    placeLabel,
    city,
    community,
    activeCount,
    medianAskingPrice: empty ? null : medianAskingPrice,
    avgDaysOnMarket: empty ? null : avgDaysOnMarket,
    empty,
    sampleNote: empty
      ? "Not enough authorized active listings to summarize this area yet."
      : scope === "community"
        ? `Based on authorized active homes for sale in ${community}, ${city}.`
        : `Based on authorized active homes for sale in ${city} (municipality level).`,
  };
}

async function queryEntitledActiveResidentialSales(input: {
  city: string;
  community?: string | null;
  entitlement: WorkspaceListingEntitlement | undefined;
}): Promise<ActiveListingStatRow[]> {
  const inventory = buildPrismaEntitledInventoryWhere({
    entitlement: input.entitlement,
    dataSource: "mls",
    statuses: ["ACTIVE"],
  });
  if (inventory.kind === "empty") return [];

  const community = input.community?.trim() || null;
  const where: Prisma.ListingWhereInput = {
    AND: [
      inventory.where,
      excludeStagingSnapshotWhere(),
      {
        transactionType: "SALE",
        segment: "RESIDENTIAL",
        status: "ACTIVE",
        city: { equals: input.city.trim(), mode: "insensitive" },
        ...(community
          ? {
              community: {
                equals: community,
                mode: "insensitive" as const,
              },
            }
          : {}),
      },
    ],
  };

  return prisma.listing.findMany({
    where,
    select: { listPrice: true, daysOnMarket: true },
    take: 500,
  });
}

async function loadNeighbourhoodInsightsUncached(input: {
  city: string | null | undefined;
  community?: string | null;
  entitlement: WorkspaceListingEntitlement | undefined;
}): Promise<NeighbourhoodInsights> {
  const city = input.city?.trim() || "";
  const community = input.community?.trim() || null;
  if (!city) {
    return buildNeighbourhoodInsightsFromActives({
      city: "",
      community: null,
      rows: [],
    });
  }

  const rows = await queryEntitledActiveResidentialSales({
    city,
    community,
    entitlement: input.entitlement,
  });
  // If community scope is empty, fall back to municipality (still entitled).
  if (community && rows.length === 0) {
    const cityRows = await queryEntitledActiveResidentialSales({
      city,
      community: null,
      entitlement: input.entitlement,
    });
    return buildNeighbourhoodInsightsFromActives({
      city,
      community: null,
      rows: cityRows,
    });
  }
  return buildNeighbourhoodInsightsFromActives({
    city,
    community,
    rows,
  });
}

/**
 * Per-request dedupe. Entitlement is always applied server-side; no sold fields.
 * Not stored in a shared public HTTP cache.
 */
export const loadNeighbourhoodInsights = cache(loadNeighbourhoodInsightsUncached);
