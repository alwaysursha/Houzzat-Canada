/**
 * Deterministic SavedSearch upsert for the consumer qualification confirm step.
 * Reuses the existing SavedSearch model — never creates a parallel search system.
 *
 * Primary ownership rules:
 * - No existing primary → qualification becomes primary + homepage-active.
 * - Another explicit primary exists → leave it primary; qualification is
 *   homepage-active only (isPrimary=false). Never demote/overwrite that primary.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  formatCompactPrice,
  type ConfirmedPreferenceInput,
} from "@/lib/auth/buyer-confirmed-preference";

/** Marker stored on SavedSearch.query for idempotent qualification upserts. */
export const QUALIFICATION_HOME_SEARCH_KEY = "qualificationHomeSearch";

export type QualificationSavedSearchResult = {
  id: string;
  created: boolean;
  updated: boolean;
  isPrimary: boolean;
  isHomepageActive: boolean;
};

function asQueryString(value: number | null | undefined): string | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  return String(Math.round(value));
}

export function buildQualificationSavedSearchQuery(
  input: Pick<
    ConfirmedPreferenceInput,
    | "cities"
    | "communities"
    | "propertyTypes"
    | "minPrice"
    | "maxPrice"
    | "minBeds"
    | "transactionType"
  > & { minBaths?: number | null },
): Record<string, unknown> {
  const cities = (input.cities ?? []).map((c) => c.trim()).filter(Boolean);
  const communities = (input.communities ?? [])
    .map((c) => c.trim())
    .filter(Boolean);
  const propertyTypes = (input.propertyTypes ?? [])
    .map((t) => t.trim())
    .filter(Boolean);
  const transactionType =
    input.transactionType === "LEASE" || input.transactionType === "SALE"
      ? input.transactionType
      : undefined;

  const query: Record<string, unknown> = {
    [QUALIFICATION_HOME_SEARCH_KEY]: true,
  };
  if (cities.length === 1) query.city = cities[0];
  if (cities.length > 1) query.cities = cities;
  if (communities.length) query.communities = communities;
  if (propertyTypes.length) query.propertyTypes = propertyTypes.join(",");
  const minPrice = asQueryString(input.minPrice);
  const maxPrice = asQueryString(input.maxPrice);
  if (minPrice) query.minPrice = minPrice;
  if (maxPrice) query.maxPrice = maxPrice;
  if (input.minBeds != null && Number.isFinite(input.minBeds)) {
    query.minBeds = String(Math.round(input.minBeds));
  }
  if (input.minBaths != null && Number.isFinite(input.minBaths)) {
    query.minBaths = String(Math.round(input.minBaths));
  }
  if (transactionType) query.transactionType = transactionType;
  return query;
}

export function qualificationSavedSearchName(input: {
  cities?: string[] | null;
  maxPrice?: number | null;
  minPrice?: number | null;
}): string {
  const city =
    input.cities?.map((c) => c.trim()).find((c) => c.length > 0) ?? null;
  if (city && input.maxPrice != null) {
    return `${city} · up to ${formatCompactPrice(input.maxPrice)}`;
  }
  if (city) return `${city} homes`;
  if (input.maxPrice != null) {
    return `Homes up to ${formatCompactPrice(input.maxPrice)}`;
  }
  return "My home search";
}

export function queryHasQualificationMarker(query: unknown): boolean {
  if (!query || typeof query !== "object" || Array.isArray(query)) return false;
  return (
    (query as Record<string, unknown>)[QUALIFICATION_HOME_SEARCH_KEY] === true
  );
}

/**
 * Whether the qualification row should own isPrimary.
 * Never steals primary from a different SavedSearch.
 */
export function resolveQualificationIsPrimary(input: {
  /** Other non-qualification row that is currently primary, if any. */
  otherPrimaryId: string | null;
  /** Qualification row id when updating an existing marked row. */
  qualificationId: string | null;
  /** Whether the qualification row itself is already primary. */
  qualificationIsAlreadyPrimary: boolean;
}): boolean {
  if (input.otherPrimaryId) return false;
  if (input.qualificationId && input.qualificationIsAlreadyPrimary) return true;
  // New customer / no other primary — qualification becomes the first primary.
  return true;
}

type SavedSearchRow = {
  id: string;
  userId: string;
  name: string;
  query: unknown;
  emailAlerts: boolean;
  smsAlerts: boolean;
  isPrimary: boolean;
  isHomepageActive: boolean;
};

/**
 * Create or update the single qualification SavedSearch for this user.
 * Homepage-active exclusivity always applies; primary is never stolen.
 */
export async function upsertQualificationSavedSearch(
  db: Pick<PrismaClient, "savedSearch">,
  input: {
    userId: string;
    cities?: string[];
    communities?: string[];
    propertyTypes?: string[];
    minPrice?: number | null;
    maxPrice?: number | null;
    minBeds?: number | null;
    minBaths?: number | null;
    transactionType?: string | null;
  },
): Promise<QualificationSavedSearchResult> {
  const query = buildQualificationSavedSearchQuery(input);
  const name = qualificationSavedSearchName({
    cities: input.cities,
    minPrice: input.minPrice,
    maxPrice: input.maxPrice,
  });

  const existing = await db.savedSearch.findMany({
    where: { userId: input.userId },
    select: {
      id: true,
      query: true,
      isPrimary: true,
      isHomepageActive: true,
    },
    orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
    take: 40,
  });

  const match =
    existing.find((row) => queryHasQualificationMarker(row.query)) ?? null;
  const otherPrimary =
    existing.find(
      (row) => row.isPrimary && (!match || row.id !== match.id),
    ) ?? null;

  const asPrimary = resolveQualificationIsPrimary({
    otherPrimaryId: otherPrimary?.id ?? null,
    qualificationId: match?.id ?? null,
    qualificationIsAlreadyPrimary: Boolean(match?.isPrimary),
  });

  // Homepage exclusivity only — never demote another search's isPrimary.
  await db.savedSearch.updateMany({
    where: {
      userId: input.userId,
      isHomepageActive: true,
      ...(match ? { NOT: { id: match.id } } : {}),
    },
    data: { isHomepageActive: false },
  });

  if (match) {
    await db.savedSearch.update({
      where: { id: match.id },
      data: {
        name,
        query: query as Prisma.InputJsonValue,
        isPrimary: asPrimary,
        isHomepageActive: true,
        emailAlerts: true,
      },
    });
    return {
      id: match.id,
      created: false,
      updated: true,
      isPrimary: asPrimary,
      isHomepageActive: true,
    };
  }

  const created = await db.savedSearch.create({
    data: {
      userId: input.userId,
      name,
      query: query as Prisma.InputJsonValue,
      emailAlerts: true,
      smsAlerts: false,
      isPrimary: asPrimary,
      isHomepageActive: true,
    },
    select: { id: true },
  });

  return {
    id: created.id,
    created: true,
    updated: false,
    isPrimary: asPrimary,
    isHomepageActive: true,
  };
}

/** In-memory SavedSearch store for ownership selftests (no Neon). */
export function createQualificationSavedSearchMemoryDb() {
  const rows: SavedSearchRow[] = [];
  let seq = 0;

  const db = {
    savedSearch: {
      async findMany(args: {
        where: { userId: string };
        select: {
          id: true;
          query: true;
          isPrimary: true;
          isHomepageActive: true;
        };
        orderBy: Array<{ isPrimary?: "desc"; updatedAt?: "desc" }>;
        take: number;
      }) {
        return rows
          .filter((r) => r.userId === args.where.userId)
          .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
          .slice(0, args.take)
          .map((r) => ({
            id: r.id,
            query: r.query,
            isPrimary: r.isPrimary,
            isHomepageActive: r.isHomepageActive,
          }));
      },
      async updateMany(args: {
        where: {
          userId: string;
          isHomepageActive?: true;
          isPrimary?: true;
          NOT?: { id: string };
        };
        data: { isHomepageActive?: boolean; isPrimary?: boolean };
      }) {
        let count = 0;
        for (const row of rows) {
          if (row.userId !== args.where.userId) continue;
          if (
            args.where.isHomepageActive === true &&
            !row.isHomepageActive
          ) {
            continue;
          }
          if (args.where.isPrimary === true && !row.isPrimary) continue;
          if (args.where.NOT?.id && row.id === args.where.NOT.id) continue;
          if (args.data.isHomepageActive !== undefined) {
            row.isHomepageActive = args.data.isHomepageActive;
          }
          if (args.data.isPrimary !== undefined) {
            row.isPrimary = args.data.isPrimary;
          }
          count += 1;
        }
        return { count };
      },
      async update(args: {
        where: { id: string };
        data: {
          name?: string;
          query?: Prisma.InputJsonValue;
          isPrimary?: boolean;
          isHomepageActive?: boolean;
          emailAlerts?: boolean;
        };
      }) {
        const row = rows.find((r) => r.id === args.where.id);
        if (!row) throw new Error("not found");
        if (args.data.name !== undefined) row.name = args.data.name;
        if (args.data.query !== undefined) row.query = args.data.query;
        if (args.data.isPrimary !== undefined) {
          row.isPrimary = args.data.isPrimary;
        }
        if (args.data.isHomepageActive !== undefined) {
          row.isHomepageActive = args.data.isHomepageActive;
        }
        if (args.data.emailAlerts !== undefined) {
          row.emailAlerts = args.data.emailAlerts;
        }
        return row;
      },
      async create(args: {
        data: {
          userId: string;
          name: string;
          query: Prisma.InputJsonValue;
          emailAlerts: boolean;
          smsAlerts: boolean;
          isPrimary: boolean;
          isHomepageActive: boolean;
        };
        select: { id: true };
      }) {
        seq += 1;
        const row: SavedSearchRow = {
          id: `ss-${seq}`,
          userId: args.data.userId,
          name: args.data.name,
          query: args.data.query,
          emailAlerts: args.data.emailAlerts,
          smsAlerts: args.data.smsAlerts,
          isPrimary: args.data.isPrimary,
          isHomepageActive: args.data.isHomepageActive,
        };
        rows.push(row);
        return { id: row.id };
      },
    },
  };

  return {
    db: db as unknown as Pick<PrismaClient, "savedSearch">,
    rows,
    seed(row: Omit<SavedSearchRow, "id"> & { id?: string }) {
      seq += 1;
      const full: SavedSearchRow = {
        id: row.id ?? `ss-${seq}`,
        userId: row.userId,
        name: row.name,
        query: row.query,
        emailAlerts: row.emailAlerts,
        smsAlerts: row.smsAlerts,
        isPrimary: row.isPrimary,
        isHomepageActive: row.isHomepageActive,
      };
      rows.push(full);
      return full;
    },
  };
}
