/**
 * Off-market reconciliation.
 *
 * Stage 1 discovery nominates ListingKeys. It never changes a listing status.
 * Stage 2 VOW Property('ListingKey') is the only writer.
 * Stage 3 walks the local on-market book by listingKey over N days.
 *
 * Cursors OnMarketDiscover, OnMarketRotate, and OnMarketTypesenseRetry are
 * independent of the Property cursor. Fast sync must not call this module.
 */
import type { ListingStatus, ListingTransactionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PropTxError, proptxFetch, proptxJson } from "@/lib/proptx/client";
import { getPropTxVowConfig, type PropTxConfig } from "@/lib/proptx/config";
import {
  mapListingKey,
  mapPropertyToListingResult,
  mapTransactionType,
  toODataDate,
  type PropTxProperty,
} from "@/lib/proptx/map-listing";
import {
  assertListingMirrorsCompatible,
  createPrismaPropTxProvenanceStore,
  createPropTxProvenanceSession,
  ensurePropTxListingProvenance,
  PropTxProvenanceError,
  type PropTxListingProvenance,
} from "@/lib/proptx/listing-provenance";
import type { MlsSyncMode } from "@/lib/proptx/mls-fast-sync";
import { cityAllowedForMlsSync, getMlsSyncCities } from "@/lib/proptx/sync-cities";
import { assertMlsSyncExecutionHost } from "@/lib/proptx/mls-sync-host";
import { syncListingToTypesense } from "@/lib/typesense/sync-listing";

export const ON_MARKET_DISCOVER_CURSOR = "OnMarketDiscover";
export const ON_MARKET_ROTATE_CURSOR = "OnMarketRotate";
export const ON_MARKET_TYPESENSE_RETRY_CURSOR = "OnMarketTypesenseRetry";

const ON_MARKET = new Set<ListingStatus>(["ACTIVE", "SOLD_CONDITIONAL"]);

export type AuthoritativeStatus =
  | "ACTIVE"
  | "SOLD_CONDITIONAL"
  | "SOLD"
  | "LEASED"
  | "EXPIRED"
  | "TERMINATED"
  | "SUSPENDED";

export type OnMarketReconcileStats = {
  discovered: number;
  candidates: number;
  verified: number;
  unchanged: number;
  sold: number;
  leased: number;
  expired: number;
  terminated: number;
  suspended: number;
  unresolved: number;
  rateLimited: number;
  transient: number;
  typesenseFailed: number;
  rotationChecked: number;
  rotationBudget: number;
  rotationCursor: string | null;
  discoveryCursor: string | null;
  discoveryComplete: boolean;
};

export type ReconcileListing = {
  id: string;
  listingKey: string;
  mlsNumber: string;
  status: ListingStatus;
  transactionType: ListingTransactionType;
  city: string;
  soldAt: Date | null;
  soldPrice: number | null;
  dataSource: string;
  isMock: boolean;
  organizationId: string | null;
  providerKey: string | null;
};

export type StatusUpdate = {
  status: AuthoritativeStatus;
  transactionType: ListingTransactionType;
  soldAt: Date | null;
  soldPrice: number | null;
  /** True for statuses other than SOLD/LEASED — clears stored sold fields. */
  clearSold: boolean;
  updatedAtMls: Date | null;
};

export type PropertyFetchResult =
  | { ok: true; row: PropTxProperty }
  | {
      ok: false;
      kind: "not_found" | "empty" | "timeout" | "rate_limited" | "server" | "transient";
    };

export type DiscoverPageResult =
  | { ok: true; listingKeys: string[]; nextPath: string | null }
  | { ok: false; kind: "rate_limited" | "server" | "transient" };

export type ReconcileDeps = {
  now: () => Date;
  getCursor: (resource: string) => Promise<string | null>;
  setCursor: (resource: string, cursor: string) => Promise<void>;
  loadOnMarketByKeys: (keys: string[]) => Promise<ReconcileListing[]>;
  loadActiveWithSoldAt: () => Promise<ReconcileListing[]>;
  loadRotationPage: (afterKey: string, limit: number) => Promise<ReconcileListing[]>;
  countAllowlistedOnMarket: () => Promise<number>;
  discoverPage: (path: string) => Promise<DiscoverPageResult>;
  fetchProperty: (listingKey: string) => Promise<PropertyFetchResult>;
  applyStatus: (
    listing: ReconcileListing,
    update: StatusUpdate,
  ) => Promise<"applied" | "provenance_blocked">;
  pushTypesense: (listingId: string) => Promise<boolean>;
};

export function emptyOnMarketReconcileStats(): OnMarketReconcileStats {
  return {
    discovered: 0,
    candidates: 0,
    verified: 0,
    unchanged: 0,
    sold: 0,
    leased: 0,
    expired: 0,
    terminated: 0,
    suspended: 0,
    unresolved: 0,
    rateLimited: 0,
    transient: 0,
    typesenseFailed: 0,
    rotationChecked: 0,
    rotationBudget: 0,
    rotationCursor: null,
    discoveryCursor: null,
    discoveryComplete: false,
  };
}

/** Daily Stage 3 budget. Inventory size is an input, never a constant. */
export function rotationDailyBudget(
  onMarketCount: number,
  rotationDays: number,
): number {
  const days = Math.max(1, Math.floor(rotationDays));
  const count = Math.max(0, Math.floor(onMarketCount));
  if (count === 0) return 0;
  return Math.ceil(count / days);
}

export function listingEligibleForReconcile(
  listing: Pick<
    ReconcileListing,
    "dataSource" | "isMock" | "status" | "listingKey" | "city"
  >,
  allowlist: string[] = getMlsSyncCities(),
): boolean {
  if (listing.isMock) return false;
  if (listing.dataSource !== "mls") return false;
  if (!listing.listingKey.trim()) return false;
  if (!ON_MARKET.has(listing.status)) return false;
  return cityAllowedForMlsSync(listing.city, allowlist);
}

/**
 * Explicit status only. The mapper's default ACTIVE fallback is not used.
 * Empty or unrecognized statuses return null so the caller leaves Neon alone.
 */
export function classifyAuthoritativeStatus(
  row: PropTxProperty,
): { status: AuthoritativeStatus; transactionType: ListingTransactionType } | null {
  const mls = str(row, "MlsStatus").toLowerCase();
  const standard = str(row, "StandardStatus").toLowerCase();
  if (!mls && !standard) return null;

  if (isConditional(mls, standard)) {
    return {
      status: "SOLD_CONDITIONAL",
      transactionType: mapTransactionType(row),
    };
  }
  if (isExplicitActive(mls, standard)) {
    return { status: "ACTIVE", transactionType: mapTransactionType(row) };
  }
  if (mls.includes("suspend") || standard.includes("suspend") || standard === "hold") {
    return { status: "SUSPENDED", transactionType: mapTransactionType(row) };
  }
  if (mls.includes("expir") || standard.includes("expir")) {
    return { status: "EXPIRED", transactionType: mapTransactionType(row) };
  }
  if (
    mls.includes("termin") ||
    standard.includes("termin") ||
    mls.includes("cancel") ||
    standard.includes("cancel") ||
    mls.includes("withdr") ||
    standard.includes("withdr")
  ) {
    return { status: "TERMINATED", transactionType: mapTransactionType(row) };
  }
  if (mls === "l" || mls.includes("leased") || standard.includes("leased")) {
    return { status: "LEASED", transactionType: "LEASE" };
  }
  if (
    mls === "s" ||
    mls.includes("sold") ||
    standard.includes("sold") ||
    mls.includes("closed") ||
    standard.includes("closed")
  ) {
    const transactionType = mapTransactionType(row);
    return {
      status: transactionType === "LEASE" ? "LEASED" : "SOLD",
      transactionType,
    };
  }
  return null;
}

export function classifyVowProperty(
  requestedKey: string,
  row: PropTxProperty,
):
  | {
      kind: "recognized";
      status: AuthoritativeStatus;
      transactionType: ListingTransactionType;
    }
  | { kind: "key_mismatch" }
  | { kind: "missing_status" }
  | { kind: "unknown_status" } {
  const key = mapListingKey(row);
  if (!key || key !== requestedKey) return { kind: "key_mismatch" };
  const mls = str(row, "MlsStatus");
  const standard = str(row, "StandardStatus");
  if (!mls && !standard) return { kind: "missing_status" };
  const recognized = classifyAuthoritativeStatus(row);
  if (!recognized) return { kind: "unknown_status" };
  return { kind: "recognized", ...recognized };
}

/** Off-market modifications since the discovery cursor. ListingKey only. */
export function buildDiscoveryPath(sinceIso: string): string {
  const since = toODataDate(new Date(sinceIso));
  const status =
    "(StandardStatus eq 'Closed' or StandardStatus eq 'Expired' or " +
    "StandardStatus eq 'Canceled' or StandardStatus eq 'Cancelled' or " +
    "StandardStatus eq 'Withdrawn' or StandardStatus eq 'Hold' or " +
    "MlsStatus eq 'Sold' or MlsStatus eq 'Leased' or MlsStatus eq 'Expired' or " +
    "MlsStatus eq 'Terminated' or MlsStatus eq 'Suspended' or " +
    "MlsStatus eq 'Withdrawn' or MlsStatus eq 'Cancelled')";
  const filter = `ModificationTimestamp ge ${since} and ${status}`;
  return (
    `Property?$select=ListingKey&$filter=${encodeURIComponent(filter)}` +
    `&$orderby=${encodeURIComponent("ModificationTimestamp,ListingKey")}&$top=100`
  );
}

export function formatOnMarketReconcileLog(stats: OnMarketReconcileStats): string {
  return (
    `[mls] on-market reconcile discovered=${stats.discovered} candidates=${stats.candidates} ` +
    `verified=${stats.verified} unchanged=${stats.unchanged} ` +
    `SOLD=${stats.sold} LEASED=${stats.leased} EXPIRED=${stats.expired} ` +
    `TERMINATED=${stats.terminated} SUSPENDED=${stats.suspended} ` +
    `unresolved=${stats.unresolved} rateLimited=${stats.rateLimited} ` +
    `transient=${stats.transient} typesenseFailed=${stats.typesenseFailed} ` +
    `rotation=${stats.rotationChecked}/${stats.rotationBudget} ` +
    `rotateCursor=${stats.rotationCursor ?? "-"} ` +
    `discoverCursor=${stats.discoveryCursor ?? "-"} ` +
    `discoverComplete=${stats.discoveryComplete}`
  );
}

type WalkResult =
  | { complete: true; keys: string[] }
  | { complete: false; reason: "capped" | "rate_limited" | "server" | "transient" };

async function walkDiscovery(options: {
  sinceIso: string;
  maxPages: number;
  discoverPage: ReconcileDeps["discoverPage"];
}): Promise<WalkResult> {
  let path: string | null = buildDiscoveryPath(options.sinceIso);
  const keys: string[] = [];
  let pages = 0;
  while (path) {
    if (pages >= options.maxPages) return { complete: false, reason: "capped" };
    const page = await options.discoverPage(path);
    pages += 1;
    if (!page.ok) {
      if (page.kind === "rate_limited") return { complete: false, reason: "rate_limited" };
      if (page.kind === "server") return { complete: false, reason: "server" };
      return { complete: false, reason: "transient" };
    }
    keys.push(...page.listingKeys.filter(Boolean));
    path = page.nextPath;
  }
  return { complete: true, keys };
}

function parseRetryIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

export async function runOnMarketReconciliation(
  deps: ReconcileDeps,
  options: {
    mode: MlsSyncMode;
    maxDiscoverPages: number;
    rotationDays: number;
    rotationBudgetOverride?: number | null;
    allowlist?: string[];
  },
): Promise<OnMarketReconcileStats> {
  const stats = emptyOnMarketReconcileStats();
  if (options.mode === "fast") return stats;

  const allowlist = options.allowlist ?? getMlsSyncCities();
  const retryResource = ON_MARKET_TYPESENSE_RETRY_CURSOR;
  const rotateResource = ON_MARKET_ROTATE_CURSOR;
  const discoverResource = ON_MARKET_DISCOVER_CURSOR;

  await retryTypesense(deps, stats, retryResource);

  const onMarketCount = await deps.countAllowlistedOnMarket();
  const budget =
    options.rotationBudgetOverride != null && options.rotationBudgetOverride > 0
      ? Math.floor(options.rotationBudgetOverride)
      : rotationDailyBudget(onMarketCount, options.rotationDays);
  stats.rotationBudget = budget;
  const rotateCursor = await deps.getCursor(rotateResource);
  stats.rotationCursor = rotateCursor;
  const rotationStopped = await runRotation(deps, stats, {
    budget,
    afterKey: rotateCursor ?? "",
    allowlist,
    resource: rotateResource,
  });
  if (rotationStopped) {
    stats.rotationCursor = await deps.getCursor(rotateResource);
    console.log(formatOnMarketReconcileLog(stats));
    return stats;
  }

  const discoverCursor = await deps.getCursor(discoverResource);
  stats.discoveryCursor = discoverCursor;
  if (!discoverCursor) {
    const initial = toODataDate(deps.now());
    await deps.setCursor(discoverResource, initial);
    stats.discoveryCursor = initial;
    stats.discoveryComplete = true;
  } else {
    const startedAt = toODataDate(deps.now());
    const walk = await walkDiscovery({
      sinceIso: discoverCursor,
      maxPages: options.maxDiscoverPages,
      discoverPage: deps.discoverPage,
    });
    if (!walk.complete) {
      if (walk.reason === "rate_limited") stats.rateLimited += 1;
      else if (walk.reason !== "capped") stats.transient += 1;
      stats.discoveryComplete = false;
      const soldAtStopped = await verifySoldAtNominations(deps, stats, allowlist);
      if (soldAtStopped) {
        stats.rotationCursor = await deps.getCursor(rotateResource);
        stats.discoveryCursor = await deps.getCursor(discoverResource);
        console.log(formatOnMarketReconcileLog(stats));
        return stats;
      }
      stats.rotationCursor = await deps.getCursor(rotateResource);
      stats.discoveryCursor = await deps.getCursor(discoverResource);
      console.log(formatOnMarketReconcileLog(stats));
      return stats;
    }
    stats.discovered = walk.keys.length;
    const local = await deps.loadOnMarketByKeys([...new Set(walk.keys)]);
    const fromDiscovery = local.filter((row) =>
      listingEligibleForReconcile(row, allowlist),
    );
    const soldAtRows = (await deps.loadActiveWithSoldAt()).filter((row) =>
      listingEligibleForReconcile(row, allowlist),
    );
    const candidates = dedupeListings([...fromDiscovery, ...soldAtRows]);
    stats.candidates = candidates.length;
    const stopped = await verifyAll(deps, stats, candidates);
    if (stopped) {
      stats.discoveryComplete = false;
      stats.rotationCursor = await deps.getCursor(rotateResource);
      stats.discoveryCursor = await deps.getCursor(discoverResource);
      console.log(formatOnMarketReconcileLog(stats));
      return stats;
    }
    await deps.setCursor(discoverResource, startedAt);
    stats.discoveryCursor = startedAt;
    stats.discoveryComplete = true;
    stats.rotationCursor = await deps.getCursor(rotateResource);
    console.log(formatOnMarketReconcileLog(stats));
    return stats;
  }

  const soldAtStopped = await verifySoldAtNominations(deps, stats, allowlist);
  stats.rotationCursor = await deps.getCursor(rotateResource);
  stats.discoveryCursor = await deps.getCursor(discoverResource);
  if (soldAtStopped) {
    console.log(formatOnMarketReconcileLog(stats));
    return stats;
  }
  console.log(formatOnMarketReconcileLog(stats));
  return stats;
}

async function verifySoldAtNominations(
  deps: ReconcileDeps,
  stats: OnMarketReconcileStats,
  allowlist: string[],
): Promise<boolean> {
  const soldAtRows = (await deps.loadActiveWithSoldAt()).filter((row) =>
    listingEligibleForReconcile(row, allowlist),
  );
  stats.candidates += soldAtRows.length;
  return verifyAll(deps, stats, soldAtRows);
}

async function verifyAll(
  deps: ReconcileDeps,
  stats: OnMarketReconcileStats,
  listings: ReconcileListing[],
): Promise<boolean> {
  for (const listing of listings) {
    const outcome = await verifyOne(deps, stats, listing);
    if (outcome === "transient") return true;
  }
  return false;
}

async function runRotation(
  deps: ReconcileDeps,
  stats: OnMarketReconcileStats,
  options: {
    budget: number;
    afterKey: string;
    allowlist: string[];
    resource: string;
  },
): Promise<boolean> {
  if (options.budget <= 0) return false;
  let after = options.afterKey;
  let wrapped = false;
  const seen = new Set<string>();
  while (stats.rotationChecked < options.budget) {
    const page = await deps.loadRotationPage(after, 200);
    if (page.length === 0) {
      if (wrapped || after === "") break;
      wrapped = true;
      after = "";
      continue;
    }
    let progressed = false;
    for (const row of page) {
      if (seen.has(row.listingKey)) return false;
      seen.add(row.listingKey);
      progressed = true;
      after = row.listingKey;
      if (!listingEligibleForReconcile(row, options.allowlist)) {
        await deps.setCursor(options.resource, row.listingKey);
        continue;
      }
      if (stats.rotationChecked >= options.budget) return false;
      const outcome = await verifyOne(deps, stats, row);
      if (outcome === "transient") return true;
      stats.rotationChecked += 1;
      await deps.setCursor(options.resource, row.listingKey);
      stats.rotationCursor = row.listingKey;
    }
    if (!progressed) break;
  }
  return false;
}

async function verifyOne(
  deps: ReconcileDeps,
  stats: OnMarketReconcileStats,
  listing: ReconcileListing,
): Promise<"definitive" | "transient"> {
  const fetched = await deps.fetchProperty(listing.listingKey);
  if (!fetched.ok) {
    if (fetched.kind === "rate_limited") {
      stats.rateLimited += 1;
      return "transient";
    }
    if (
      fetched.kind === "server" ||
      fetched.kind === "timeout" ||
      fetched.kind === "transient"
    ) {
      stats.transient += 1;
      return "transient";
    }
    stats.unresolved += 1;
    stats.verified += 1;
    return "definitive";
  }

  const classified = classifyVowProperty(listing.listingKey, fetched.row);
  if (classified.kind !== "recognized") {
    stats.unresolved += 1;
    stats.verified += 1;
    return "definitive";
  }
  stats.verified += 1;
  if (
    classified.status === listing.status &&
    classified.transactionType === listing.transactionType
  ) {
    stats.unchanged += 1;
    return "definitive";
  }

  const sold =
    classified.status === "SOLD" || classified.status === "LEASED"
      ? readSoldFields(fetched.row)
      : { soldAt: null, soldPrice: null };
  const applied = await deps.applyStatus(listing, {
    status: classified.status,
    transactionType: classified.transactionType,
    soldAt: sold.soldAt,
    soldPrice: sold.soldPrice,
    clearSold: classified.status !== "SOLD" && classified.status !== "LEASED",
    updatedAtMls: readUpdatedAtMls(fetched.row),
  });
  if (applied !== "applied") {
    stats.unresolved += 1;
    return "definitive";
  }
  countTransition(stats, classified.status);
  const indexed = await deps.pushTypesense(listing.id);
  if (!indexed) {
    stats.typesenseFailed += 1;
    await rememberRetry(deps, listing.id);
  }
  return "definitive";
}

function countTransition(stats: OnMarketReconcileStats, status: AuthoritativeStatus) {
  if (status === "SOLD") stats.sold += 1;
  else if (status === "LEASED") stats.leased += 1;
  else if (status === "EXPIRED") stats.expired += 1;
  else if (status === "TERMINATED") stats.terminated += 1;
  else if (status === "SUSPENDED") stats.suspended += 1;
}

async function rememberRetry(deps: ReconcileDeps, listingId: string): Promise<void> {
  const current = parseRetryIds(
    await deps.getCursor(ON_MARKET_TYPESENSE_RETRY_CURSOR),
  );
  if (!current.includes(listingId)) current.push(listingId);
  await deps.setCursor(ON_MARKET_TYPESENSE_RETRY_CURSOR, JSON.stringify(current));
}

async function retryTypesense(
  deps: ReconcileDeps,
  stats: OnMarketReconcileStats,
  resource: string,
): Promise<void> {
  const ids = parseRetryIds(await deps.getCursor(resource));
  if (ids.length === 0) return;
  const remain: string[] = [];
  for (const id of ids) {
    const ok = await deps.pushTypesense(id);
    if (!ok) {
      remain.push(id);
      stats.typesenseFailed += 1;
    }
  }
  await deps.setCursor(resource, JSON.stringify(remain));
}

function dedupeListings(rows: ReconcileListing[]): ReconcileListing[] {
  const seen = new Set<string>();
  const out: ReconcileListing[] = [];
  for (const row of rows) {
    if (seen.has(row.listingKey)) continue;
    seen.add(row.listingKey);
    out.push(row);
  }
  return out;
}

function readSoldFields(row: PropTxProperty): {
  soldAt: Date | null;
  soldPrice: number | null;
} {
  const mapped = mapPropertyToListingResult(row);
  if (!mapped.ok) return { soldAt: null, soldPrice: null };
  const soldAt = mapped.data.soldAt instanceof Date ? mapped.data.soldAt : null;
  const soldPrice =
    typeof mapped.data.soldPrice === "number" ? mapped.data.soldPrice : null;
  return { soldAt, soldPrice };
}

function readUpdatedAtMls(row: PropTxProperty): Date | null {
  const raw = row.ModificationTimestamp;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function str(row: PropTxProperty, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value.trim() : "";
}

function isConditional(mls: string, standard: string): boolean {
  if (
    standard.includes("active under contract") ||
    standard === "activeundercontract"
  ) {
    return true;
  }
  if (mls.includes("sold conditional") || mls.includes("sld cond")) return true;
  if (mls.includes("leased conditional") || mls.includes("lsd cond")) return true;
  if (mls.includes("lease conditional")) return true;
  if (mls.includes("conditional") && mls.includes("sold")) return true;
  if (mls.includes("conditional") && mls.includes("leased")) return true;
  return false;
}

function isExplicitActive(mls: string, standard: string): boolean {
  if (standard === "active" || mls === "a" || mls === "active") return true;
  if (mls.includes("price change") || mls.includes("extension")) return true;
  if (standard === "new" || mls === "new") return true;
  if (standard === "available" || mls === "available") return true;
  return false;
}

function envPositiveInt(name: string): number | null {
  const raw = process.env[name]?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

const LISTING_SELECT = {
  id: true,
  listingKey: true,
  mlsNumber: true,
  status: true,
  transactionType: true,
  city: true,
  soldAt: true,
  soldPrice: true,
  dataSource: true,
  isMock: true,
  organizationId: true,
  providerKey: true,
} as const;

function asReconcileListing(row: {
  id: string;
  listingKey: string | null;
  mlsNumber: string;
  status: ListingStatus;
  transactionType: ListingTransactionType;
  city: string;
  soldAt: Date | null;
  soldPrice: number | null;
  dataSource: string;
  isMock: boolean;
  organizationId: string | null;
  providerKey: string | null;
}): ReconcileListing | null {
  if (!row.listingKey) return null;
  return { ...row, listingKey: row.listingKey };
}

export async function executeOnMarketReconciliation(options: {
  mode: MlsSyncMode;
}): Promise<OnMarketReconcileStats> {
  assertMlsSyncExecutionHost();
  if (options.mode === "fast") return emptyOnMarketReconcileStats();
  const vow = getPropTxVowConfig();
  if (!vow) {
    console.error(
      "[mls] on-market reconcile skipped — VOW credentials are not configured",
    );
    return emptyOnMarketReconcileStats();
  }
  let provenance: PropTxListingProvenance;
  try {
    provenance = await createPropTxProvenanceSession(
      createPrismaPropTxProvenanceStore(prisma),
    ).get();
  } catch (err) {
    console.error(
      "[mls] on-market reconcile skipped — provenance unavailable",
      err instanceof Error ? err.message : err,
    );
    return emptyOnMarketReconcileStats();
  }

  const deps = createProductionDeps(vow, provenance);
  return runOnMarketReconciliation(deps, {
    mode: options.mode,
    maxDiscoverPages: envPositiveInt("MLS_ON_MARKET_DISCOVER_MAX_PAGES") ?? 40,
    rotationDays: envPositiveInt("MLS_ON_MARKET_ROTATE_DAYS") ?? 7,
    rotationBudgetOverride: envPositiveInt("MLS_ON_MARKET_ROTATE_BUDGET"),
  });
}

function createProductionDeps(
  vow: PropTxConfig,
  provenance: PropTxListingProvenance,
): ReconcileDeps {
  return {
    now: () => new Date(),
    async getCursor(resource) {
      const row = await prisma.mlsSyncCursor.findUnique({ where: { resource } });
      return row?.cursor ?? null;
    },
    async setCursor(resource, cursor) {
      await prisma.mlsSyncCursor.upsert({
        where: { resource },
        create: { resource, cursor },
        update: { cursor },
      });
    },
    async loadOnMarketByKeys(keys) {
      if (keys.length === 0) return [];
      const rows = await prisma.listing.findMany({
        where: {
          listingKey: { in: keys },
          dataSource: "mls",
          isMock: false,
          status: { in: ["ACTIVE", "SOLD_CONDITIONAL"] },
        },
        select: LISTING_SELECT,
      });
      return rows.flatMap((row) => {
        const listing = asReconcileListing(row);
        return listing ? [listing] : [];
      });
    },
    async loadActiveWithSoldAt() {
      const rows = await prisma.listing.findMany({
        where: {
          dataSource: "mls",
          isMock: false,
          status: "ACTIVE",
          soldAt: { not: null },
          listingKey: { not: null },
        },
        select: LISTING_SELECT,
      });
      return rows.flatMap((row) => {
        const listing = asReconcileListing(row);
        return listing ? [listing] : [];
      });
    },
    async loadRotationPage(afterKey, limit) {
      const rows = await prisma.listing.findMany({
        where: {
          dataSource: "mls",
          isMock: false,
          status: { in: ["ACTIVE", "SOLD_CONDITIONAL"] },
          listingKey: { gt: afterKey },
        },
        orderBy: { listingKey: "asc" },
        take: limit,
        select: LISTING_SELECT,
      });
      return rows.flatMap((row) => {
        const listing = asReconcileListing(row);
        return listing ? [listing] : [];
      });
    },
    async countAllowlistedOnMarket() {
      const groups = await prisma.listing.groupBy({
        by: ["city"],
        where: {
          dataSource: "mls",
          isMock: false,
          listingKey: { not: null },
          status: { in: ["ACTIVE", "SOLD_CONDITIONAL"] },
        },
        _count: { _all: true },
      });
      let total = 0;
      for (const group of groups) {
        if (!cityAllowedForMlsSync(group.city)) continue;
        total += group._count._all;
      }
      return total;
    },
    discoverPage: (path) => discoverVowPage(path, vow),
    fetchProperty: (listingKey) => fetchVowProperty(listingKey, vow),
    async applyStatus(listing, update) {
      try {
        assertListingMirrorsCompatible(
          provenance,
          {
            organizationId: listing.organizationId,
            providerKey: listing.providerKey,
          },
          { listingId: listing.id, mlsNumber: listing.mlsNumber },
        );
      } catch (err) {
        if (err instanceof PropTxProvenanceError) return "provenance_blocked";
        throw err;
      }
      await prisma.listing.update({
        where: { id: listing.id },
        data: {
          status: update.status,
          transactionType: update.transactionType,
          ...(update.updatedAtMls ? { updatedAtMls: update.updatedAtMls } : {}),
          ...(update.clearSold
            ? { soldAt: null, soldPrice: null }
            : {
                ...(update.soldAt ? { soldAt: update.soldAt } : {}),
                ...(update.soldPrice != null ? { soldPrice: update.soldPrice } : {}),
              }),
        },
      });
      try {
        await ensurePropTxListingProvenance(
          createPrismaPropTxProvenanceStore(prisma),
          provenance,
          {
            listingId: listing.id,
            listingKey: listing.listingKey,
            mlsNumber: listing.mlsNumber,
            organizationId: listing.organizationId,
            providerKey: listing.providerKey,
          },
        );
      } catch (err) {
        if (!(err instanceof PropTxProvenanceError)) throw err;
        console.error(
          `[mls] on-market reconcile provenance ${listing.mlsNumber}: ${err.code}`,
        );
      }
      return "applied";
    },
    async pushTypesense(listingId) {
      const result = await syncListingToTypesense(listingId);
      return result.ok;
    },
  };
}

async function discoverVowPage(
  path: string,
  vow: PropTxConfig,
): Promise<DiscoverPageResult> {
  try {
    const res = await proptxFetch(path, {}, vow, {
      timeoutMs: 25_000,
    });
    const data = (await res.json()) as {
      value?: Array<{ ListingKey?: string }>;
      "@odata.nextLink"?: string;
    };
    const listingKeys = (data.value ?? [])
      .map((row) => (typeof row.ListingKey === "string" ? row.ListingKey : ""))
      .filter(Boolean);
    return { ok: true, listingKeys, nextPath: data["@odata.nextLink"] ?? null };
  } catch (err) {
    return { ok: false, kind: fetchFailureKind(err) };
  }
}

async function fetchVowProperty(
  listingKey: string,
  vow: PropTxConfig,
): Promise<PropertyFetchResult> {
  const path = `Property('${listingKey.replace(/'/g, "''")}')`;
  try {
    const row = await proptxJson<PropTxProperty>(path, vow, {
      timeoutMs: 20_000,
    });
    if (!row || typeof row !== "object" || Object.keys(row).length === 0) {
      return { ok: false, kind: "empty" };
    }
    return { ok: true, row };
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return { ok: false, kind: "timeout" };
    }
    const kind = fetchFailureKind(err);
    if (kind === "rate_limited") return { ok: false, kind: "rate_limited" };
    if (kind === "server") return { ok: false, kind: "server" };
    if (err instanceof PropTxError && err.status === 404) {
      return { ok: false, kind: "not_found" };
    }
    return { ok: false, kind: "transient" };
  }
}

function fetchFailureKind(
  err: unknown,
): "rate_limited" | "server" | "transient" {
  if (err instanceof PropTxError) {
    if (err.status === 429) return "rate_limited";
    if (err.status >= 500) return "server";
  }
  return "transient";
}
