/**
 * Stage 6.11G.10B1 — Typesense + Prisma MLS listing entitlement filters.
 *
 * Exact (organizationId, providerKey) / sourceAuthorityKey pairs only.
 * Capability-scoped status branches prevent ACTIVE_LISTINGS from exposing SOLD
 * (and vice versa) in mixed-status queries.
 *
 * Production gate: G5_ENTITLEMENT_FILTERING_ENABLED (must stay false until
 * G.10B3 after home-rails enforcement is verified — G.10B2H).
 */

import type { ListingStatus, Prisma } from "@prisma/client";
import {
  expandOnMarketStatuses,
  ON_MARKET_LISTING_STATUSES,
} from "@/lib/listings/constants";
import type {
  ListingDataCapability,
  WorkspaceListingEntitlement,
} from "@/lib/tenancy/listing-entitlement/types";
import { G5_ENTITLEMENT_FILTERING_ENABLED } from "@/lib/tenancy/listing-provenance";

export type TypesenseAuthorityFilterResult =
  | { kind: "empty" }
  | { kind: "filter"; filterBy: string };

export type PrismaAuthorityWhereResult =
  | { kind: "empty" }
  | { kind: "where"; where: Prisma.ListingWhereInput };

const SOLD_CAPABILITY_STATUSES: readonly ListingStatus[] = ["SOLD", "LEASED"];
const UNLISTED_STATUSES: readonly ListingStatus[] = [
  "SUSPENDED",
  "TERMINATED",
  "EXPIRED",
];

/**
 * Typesense filter value escaping — mirrors `src/lib/typesense/search.ts`.
 * SAK values contain `:` and must be backtick-quoted.
 */
export function quoteTypesenseFilterValue(value: string): string {
  if (/^[A-Za-z0-9_-]+$/.test(value)) return value;
  return `\`${value.replace(/`/g, "")}\``;
}

/**
 * Pure monotonic enforcement gate (testable without flipping production config).
 *
 * - productionEnabled ON → always ON (forceEnable false cannot downgrade)
 * - productionEnabled OFF → ON only when forceEnable === true
 */
export function resolveListingEntitlementEnforcementEnabled(input: {
  productionEnabled: boolean;
  /** Test/internal force-ON only. Never forces OFF. */
  forceEnable?: boolean;
}): boolean {
  return input.productionEnabled || input.forceEnable === true;
}

/**
 * Server-only enforcement gate.
 * Production callers omit forceEnable → G5 flag (currently OFF).
 * Selftests may pass `true` to force-ON without flipping the production constant.
 * Passing `false` NEVER disables enforcement when the production flag is ON.
 */
export function isListingEntitlementEnforcementEnabled(
  forceEnable?: boolean,
): boolean {
  return resolveListingEntitlementEnforcementEnabled({
    productionEnabled: G5_ENTITLEMENT_FILTERING_ENABLED,
    forceEnable,
  });
}

/**
 * Historical G.10B1 marker. G.10B2H wires home-rails entitlement (flag still OFF).
 * Kept false so regressions detect accidental reversion to the unwired path.
 */
export const G10B1_HOME_RAILS_OUTSIDE_ENTITLEMENT_ENFORCEMENT = false as const;

/** G.10B2H — home-rails Typesense + Neon fallback accept entitlement snapshots. */
export const G10B2H_HOME_RAILS_ENTITLEMENT_WIRED = true as const;

function authoritiesWithCapability(
  entitlement: WorkspaceListingEntitlement,
  capability: ListingDataCapability,
) {
  return entitlement.authorities.filter((a) =>
    a.capabilities.includes(capability),
  );
}

function sourceAuthorityKeys(
  authorities: readonly { sourceAuthorityKey: string }[],
): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const a of authorities) {
    const key = a.sourceAuthorityKey.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

function typesenseSourceAuthorityKeyClause(keys: string[]): string | null {
  if (keys.length === 0) return null;
  if (keys.length === 1) {
    return `sourceAuthorityKey:=${quoteTypesenseFilterValue(keys[0]!)}`;
  }
  return `sourceAuthorityKey:=[${keys.map(quoteTypesenseFilterValue).join(",")}]`;
}

/**
 * Exact-pair Typesense filter for one required capability.
 * Empty / missing capability → kind empty (never omit-able empty string).
 */
export function buildTypesenseListingAuthorityFilter(
  entitlement: WorkspaceListingEntitlement,
  requiredCapability: ListingDataCapability,
): TypesenseAuthorityFilterResult {
  const keys = sourceAuthorityKeys(
    authoritiesWithCapability(entitlement, requiredCapability),
  );
  const clause = typesenseSourceAuthorityKeyClause(keys);
  if (!clause) return { kind: "empty" };
  return { kind: "filter", filterBy: clause };
}

/**
 * Exact-pair Prisma MLS predicate for one required capability.
 * Includes dataSource=mls + isMock=false. Empty → kind empty (no OR: []).
 */
export function buildPrismaListingAuthorityWhere(
  entitlement: WorkspaceListingEntitlement,
  requiredCapability: ListingDataCapability,
): PrismaAuthorityWhereResult {
  const authorities = authoritiesWithCapability(
    entitlement,
    requiredCapability,
  );
  if (authorities.length === 0) return { kind: "empty" };

  const pairs = authorities.map((a) => ({
    organizationId: a.organizationId,
    providerKey: a.providerKey,
  }));

  return {
    kind: "where",
    where: {
      AND: [
        { dataSource: "mls" },
        { isMock: false },
        { OR: pairs },
      ],
    },
  };
}

export type NormalizedSearchStatuses = {
  /** null = product "ALL" (no status restriction before entitlement branching). */
  statuses: ListingStatus[] | null;
};

/**
 * Partition normalized statuses into capability buckets.
 * ACTIVE / SOLD_CONDITIONAL → ACTIVE_LISTINGS
 * SOLD / LEASED → SOLD
 * UNLISTED → ACTIVE_LISTINGS (no HISTORY in ordinary search)
 */
export function partitionStatusesByListingCapability(
  statuses: ListingStatus[] | null,
): {
  activeListings: ListingStatus[];
  sold: ListingStatus[];
} {
  if (statuses === null) {
    return {
      activeListings: [
        ...ON_MARKET_LISTING_STATUSES,
        ...UNLISTED_STATUSES,
      ],
      sold: [...SOLD_CAPABILITY_STATUSES],
    };
  }

  const activeListings: ListingStatus[] = [];
  const sold: ListingStatus[] = [];
  for (const s of statuses) {
    if (s === "SOLD" || s === "LEASED") {
      sold.push(s);
    } else if (
      s === "ACTIVE" ||
      s === "SOLD_CONDITIONAL" ||
      s === "SUSPENDED" ||
      s === "TERMINATED" ||
      s === "EXPIRED"
    ) {
      activeListings.push(s);
    }
  }
  return { activeListings, sold };
}

function wrapTypesenseBranch(statusClause: string, authorityClause: string): string {
  return `(${statusClause} && ${authorityClause})`;
}

function typesenseStatusClause(statuses: ListingStatus[]): string | null {
  if (statuses.length === 0) return null;
  if (statuses.length === 1) return `status:=${statuses[0]}`;
  return `status:=[${statuses.join(",")}]`;
}

/**
 * Capability-scoped Typesense status+authority filter for mixed queries.
 */
export function buildTypesenseCapabilityScopedStatusFilter(
  entitlement: WorkspaceListingEntitlement,
  statuses: ListingStatus[] | null,
): TypesenseAuthorityFilterResult {
  const buckets = partitionStatusesByListingCapability(statuses);
  const branches: string[] = [];

  if (buckets.activeListings.length > 0) {
    const auth = buildTypesenseListingAuthorityFilter(
      entitlement,
      "ACTIVE_LISTINGS",
    );
    const statusClause = typesenseStatusClause(buckets.activeListings);
    if (auth.kind === "filter" && statusClause) {
      branches.push(wrapTypesenseBranch(statusClause, auth.filterBy));
    }
  }

  if (buckets.sold.length > 0) {
    const auth = buildTypesenseListingAuthorityFilter(entitlement, "SOLD");
    const statusClause = typesenseStatusClause(buckets.sold);
    if (auth.kind === "filter" && statusClause) {
      branches.push(wrapTypesenseBranch(statusClause, auth.filterBy));
    }
  }

  if (branches.length === 0) return { kind: "empty" };
  if (branches.length === 1) return { kind: "filter", filterBy: branches[0]! };
  return { kind: "filter", filterBy: `(${branches.join(" || ")})` };
}

/**
 * Capability-scoped Prisma status+authority filter for mixed queries.
 */
export function buildPrismaCapabilityScopedStatusWhere(
  entitlement: WorkspaceListingEntitlement,
  statuses: ListingStatus[] | null,
): PrismaAuthorityWhereResult {
  const buckets = partitionStatusesByListingCapability(statuses);
  const branches: Prisma.ListingWhereInput[] = [];

  if (buckets.activeListings.length > 0) {
    const auth = buildPrismaListingAuthorityWhere(
      entitlement,
      "ACTIVE_LISTINGS",
    );
    if (auth.kind === "where") {
      branches.push({
        AND: [auth.where, { status: { in: buckets.activeListings } }],
      });
    }
  }

  if (buckets.sold.length > 0) {
    const auth = buildPrismaListingAuthorityWhere(entitlement, "SOLD");
    if (auth.kind === "where") {
      branches.push({
        AND: [auth.where, { status: { in: buckets.sold } }],
      });
    }
  }

  if (branches.length === 0) return { kind: "empty" };
  if (branches.length === 1) return { kind: "where", where: branches[0]! };
  return { kind: "where", where: { OR: branches } };
}

/** Normalize search params statuses the same way Typesense/Neon search do. */
export function normalizeListingSearchStatuses(params: {
  status?: ListingStatus | "ALL" | "UNLISTED";
  statuses?: Array<ListingStatus | "UNLISTED">;
}): ListingStatus[] | null {
  if (params.statuses?.length) {
    const out: string[] = [];
    for (const s of params.statuses) {
      if (s === "UNLISTED") {
        out.push("SUSPENDED", "TERMINATED", "EXPIRED");
      } else {
        out.push(s);
      }
    }
    return expandOnMarketStatuses(out);
  }
  if (params.status === "UNLISTED") {
    return ["SUSPENDED", "TERMINATED", "EXPIRED"];
  }
  if (params.status === "ALL") return null;
  if (params.status === "ACTIVE") return [...ON_MARKET_LISTING_STATUSES];
  if (params.status) return [params.status];
  return [...ON_MARKET_LISTING_STATUSES];
}

/**
 * Neon inventory composition when entitlement enforcement is ON.
 * FSBO-only → existing FSBO policy (no MLS entitlement).
 * MLS-only → exact-pair MLS (empty → empty).
 * Default mix → authorized MLS branch OR ACTIVE FSBO (status applied to FSBO).
 */
export function buildPrismaEntitledInventoryWhere(input: {
  entitlement: WorkspaceListingEntitlement | undefined;
  dataSource?: "fsbo" | "mls" | "ALL";
  statuses: ListingStatus[] | null;
}): PrismaAuthorityWhereResult {
  const statusClause: Prisma.ListingWhereInput | null =
    input.statuses === null ? null : { status: { in: input.statuses } };

  const fsboBranch: Prisma.ListingWhereInput = statusClause
    ? {
        AND: [
          { dataSource: "fsbo", ownerStatus: "ACTIVE" },
          statusClause,
        ],
      }
    : { dataSource: "fsbo", ownerStatus: "ACTIVE" };

  if (input.dataSource === "fsbo") {
    return { kind: "where", where: fsboBranch };
  }

  if (!input.entitlement) {
    return { kind: "empty" };
  }

  const mlsScoped = buildPrismaCapabilityScopedStatusWhere(
    input.entitlement,
    input.statuses,
  );

  if (input.dataSource === "mls") {
    return mlsScoped;
  }

  // Default mixed: authorized MLS ∪ ACTIVE FSBO
  if (mlsScoped.kind === "empty") {
    return { kind: "where", where: fsboBranch };
  }
  return {
    kind: "where",
    where: {
      OR: [mlsScoped.where, fsboBranch],
    },
  };
}

/**
 * AND-compose an authority clause with existing Typesense filter parts.
 * Empty authority → empty (caller must not query unfiltered).
 */
export function composeTypesenseFilterWithAuthority(
  baseFilterBy: string | undefined,
  authority: TypesenseAuthorityFilterResult,
): TypesenseAuthorityFilterResult {
  if (authority.kind === "empty") return { kind: "empty" };
  if (!baseFilterBy) {
    return { kind: "filter", filterBy: authority.filterBy };
  }
  return {
    kind: "filter",
    filterBy: `${baseFilterBy} && ${authority.filterBy}`,
  };
}
