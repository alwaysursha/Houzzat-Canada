/**
 * Staging-only listing snapshot for the HIGH OCTANE workspace.
 * This is not an MLS connection, board membership, or PropTx credential.
 * Production Node and every other workspace slug fail closed.
 */
import type { Prisma, PropertyType } from "@prisma/client";
import { NEON_LISTING_MEDIA_CAP } from "@/lib/listings/gallery-constants";
import { listingPhotoSrc } from "@/lib/listings/photo-src";
import { evaluateHighOctaneStagingEnvironment } from "@/lib/tenancy/templates/high-octane-staging";
import { HIGH_OCTANE_STAGING_BRANCH_ID } from "@/lib/tenancy/templates/high-octane-staging-launch";
import {
  HIGH_OCTANE_STAGING_FEATURED_CITIES,
  HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
} from "@/lib/tenancy/templates/high-octane-staging-slug";
import { CURRENT_PROPTX_PROVIDER_KEY } from "@/lib/tenancy/listing-provenance/contract";

export const HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE = "staging-snapshot" as const;

/** Unrecognized on purpose. MLS entitlement ignores this provider key. */
export const HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY = "staging-snapshot" as const;

export const HIGH_OCTANE_STAGING_SNAPSHOT_CONFIRMATION =
  "APPLY_HIGH_OCTANE_STAGING_SNAPSHOT" as const;

/**
 * Internal-review identities only. Presence on this list is not permission
 * to display or republish the photographs.
 */
export const HIGH_OCTANE_STAGING_SNAPSHOT_ALLOWLIST = [
  "X12935628",
  "X13744972",
  "X13717936",
  "N13526934",
  "X13542440",
] as const;

const STAGING_SNAPSHOT_ALLOWLIST = new Set<string>(HIGH_OCTANE_STAGING_SNAPSHOT_ALLOWLIST);

export function snapshotImportCliDecision(args: readonly string[]): "dry-run" | "refused" {
  if (args.length > 1) return "refused";
  if (args.length === 1 && args[0] !== "--dry-run") return "refused";
  return "dry-run";
}

const NIAGARA_CITIES = new Set<string>([
  ...HIGH_OCTANE_STAGING_FEATURED_CITIES,
  "Fort Erie",
  "Pelham",
  "Lincoln",
  "Port Colborne",
  "Wainfleet",
  "Niagara",
].map((city) => city.toLowerCase()));

const BLOCKED_DETAIL_CAPABILITIES = new Set(["SOLD", "HISTORY"]);

export type StagingSnapshotMediaClass = "public-cdn" | "token-or-proxy" | "rejected";

export type StagingSnapshotCandidate = {
  mlsNumber: string;
  status: "ACTIVE" | "SOLD" | "LEASED" | "SOLD_CONDITIONAL" | "SUSPENDED" | "TERMINATED" | "EXPIRED";
  city: string;
  propertyType: PropertyType;
  listPrice: number;
  beds: number;
  baths: number;
  sqft: number | null;
  addressLine: string;
  brokerageName: string;
  description: string;
  lat: number;
  lng: number;
  waterfront: boolean | null;
  photoCount: number;
  photos: ReadonlyArray<{ url: string; sortOrder: number; isPrimary: boolean }>;
  providerListingKey: string;
  listedAt: string;
};

export type StagingSnapshotSlot =
  | "luxury-detached"
  | "waterfront-or-estate"
  | "condominium"
  | "many-photographs"
  | "limited-photographs";

/** Slot assigned by the review selector, or a candidate the planner refused. */
export type StagingSnapshotPlanSlot = StagingSnapshotSlot | "excluded";

export type StagingSnapshotSelection = {
  slot: StagingSnapshotSlot;
  candidate: StagingSnapshotCandidate | null;
  reason: string;
};

export function isHighOctaneStagingSnapshotDataSource(
  dataSource: string | null | undefined,
): boolean {
  return dataSource?.trim().toLowerCase() === HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE;
}

/**
 * True only for the verified staging process and the HIGH OCTANE workspace.
 * A pooled-versus-direct host difference is not enough. Production cannot pass.
 */
export function isHighOctaneStagingSnapshotVisible(input: {
  workspaceSlug: string | null | undefined;
  env?: NodeJS.ProcessEnv;
}): boolean {
  const env = input.env ?? process.env;
  if (env.NODE_ENV === "production") return false;
  if (input.workspaceSlug?.trim() !== HIGH_OCTANE_STAGING_WORKSPACE_SLUG) return false;
  return evaluateHighOctaneStagingEnvironment(env).ready;
}

export function stagingSnapshotInventoryWhere(): Prisma.ListingWhereInput {
  return {
    dataSource: HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE,
    status: "ACTIVE",
    organizationId: null,
    providerKey: HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY,
    isMock: false,
  };
}

/** Default boundary. Snapshot rows stay out until a caller opts in. */
export function excludeStagingSnapshotWhere(): Prisma.ListingWhereInput {
  return {
    dataSource: { not: HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE },
  };
}

/**
 * Public inventory where-clause. `visible` is the server staging flag only.
 * Sold and other non-active bases still miss the snapshot branch because that
 * branch itself requires ACTIVE.
 */
export function withStagingSnapshotBoundary(
  base: Prisma.ListingWhereInput,
  visible: boolean,
): Prisma.ListingWhereInput {
  if (!visible) return { AND: [base, excludeStagingSnapshotWhere()] };
  return {
    OR: [
      { AND: [base, excludeStagingSnapshotWhere()] },
      { AND: [base, stagingSnapshotInventoryWhere()] },
    ],
  };
}

export type StagingSnapshotBranchRow = {
  branch_id: string | null;
};

export async function assertHighOctaneStagingSnapshotBranch(
  query: (sql: string) => Promise<{ rows: StagingSnapshotBranchRow[] }>,
): Promise<void> {
  const probed = await query(
    "SELECT current_setting('neon.branch_id', true) AS branch_id",
  );
  if (probed.rows[0]?.branch_id !== HIGH_OCTANE_STAGING_BRANCH_ID) {
    throw new Error("staging snapshot write refused");
  }
}

export function searchMayIncludeStagingSnapshot(input: {
  visible: boolean;
  status?: string | null;
  statuses?: readonly string[] | null;
}): boolean {
  if (!input.visible) return false;
  const statuses = input.statuses?.filter(Boolean) ?? [];
  if (statuses.length > 0) {
    return statuses.some((status) => status === "ACTIVE" || status === "ALL");
  }
  if (!input.status || input.status === "ACTIVE" || input.status === "ALL") return true;
  return false;
}

export function combineInventoryWhere(
  base: Prisma.ListingWhereInput,
  includeSnapshot: boolean,
): Prisma.ListingWhereInput {
  if (!includeSnapshot) return base;
  return { OR: [base, stagingSnapshotInventoryWhere()] };
}

/**
 * Classify a stored media URL without downloading it.
 * Public CDN hosts render directly. Proxied hosts need a bearer this staging
 * process does not have, so they are not eligible for the snapshot.
 */
export function assessStagingSnapshotMediaUrl(url: string | null | undefined): StagingSnapshotMediaClass {
  const trimmed = url?.trim() ?? "";
  if (!trimmed) return "rejected";
  const display = listingPhotoSrc(trimmed);
  if (!display) return "rejected";
  if (display.startsWith("/api/listings/photo")) return "token-or-proxy";
  if (display === trimmed) return "public-cdn";
  return "rejected";
}

export function isNiagaraSnapshotCity(city: string | null | undefined): boolean {
  return NIAGARA_CITIES.has(city?.trim().toLowerCase() ?? "");
}

function byNiagaraThen<T extends StagingSnapshotCandidate>(
  rows: readonly T[],
  compare: (left: T, right: T) => number,
): T[] {
  return [...rows].sort((left, right) => {
    const niagara = Number(isNiagaraSnapshotCity(right.city)) - Number(isNiagaraSnapshotCity(left.city));
    if (niagara !== 0) return niagara;
    return compare(left, right);
  });
}

function publicPhotos(candidate: StagingSnapshotCandidate) {
  return candidate.photos.filter((photo) => assessStagingSnapshotMediaUrl(photo.url) === "public-cdn");
}

function eligible(candidate: StagingSnapshotCandidate): boolean {
  return candidate.status === "ACTIVE" && publicPhotos(candidate).length > 0;
}

/**
 * Choose up to five permitted active listings. Field values are not rewritten.
 * An empty input selects nothing. This function does not read a database.
 */
export function selectHighOctaneStagingSnapshot(
  candidates: readonly StagingSnapshotCandidate[],
): StagingSnapshotSelection[] {
  const pool = candidates.filter(eligible);
  const used = new Set<string>();
  const take = (
    slot: StagingSnapshotSlot,
    rows: StagingSnapshotCandidate[],
    emptyReason: string,
  ): StagingSnapshotSelection => {
    const candidate = rows.find((row) => !used.has(row.mlsNumber)) ?? null;
    if (!candidate) return { slot, candidate: null, reason: emptyReason };
    used.add(candidate.mlsNumber);
    return { slot, candidate, reason: "selected" };
  };

  const detached = byNiagaraThen(
    pool.filter((row) => row.propertyType === "DETACHED"),
    (left, right) => right.listPrice - left.listPrice,
  );
  const luxury = take(
    "luxury-detached",
    detached,
    "no active detached listing with a public photo",
  );
  const waterfront = take(
    "waterfront-or-estate",
    byNiagaraThen(
      pool.filter((row) => row.waterfront === true),
      (left, right) => {
        const detachedRank = Number(right.propertyType === "DETACHED") - Number(left.propertyType === "DETACHED");
        if (detachedRank !== 0) return detachedRank;
        return right.listPrice - left.listPrice;
      },
    ),
    "no active waterfront listing with a public photo",
  );
  const condo = take(
    "condominium",
    byNiagaraThen(
      pool.filter((row) => row.propertyType === "CONDO_APT" || row.propertyType === "CONDO_TOWNHOUSE"),
      (left, right) => {
        const apt = Number(left.propertyType === "CONDO_APT") - Number(right.propertyType === "CONDO_APT");
        if (apt !== 0) return apt;
        return right.listPrice - left.listPrice;
      },
    ),
    "no active condominium with a public photo",
  );
  const many = take(
    "many-photographs",
    byNiagaraThen(pool, (left, right) => right.photoCount - left.photoCount),
    "no remaining listing with photographs",
  );
  const limited = take(
    "limited-photographs",
    byNiagaraThen(
      pool.filter((row) => row.photoCount > 0 && row.photoCount <= 2),
      (left, right) => left.photoCount - right.photoCount,
    ),
    "no remaining listing with only one or two photographs",
  );
  return [luxury, waterfront, condo, many, limited];
}

export type SnapshotExistingListing = {
  mlsNumber: string;
  dataSource: string;
};

export type SnapshotRecordPlan = {
  mlsNumber: string;
  slot: StagingSnapshotPlanSlot;
  action: "create" | "already_present" | "rejected";
  reason: string;
  listing: {
    mlsNumber: string;
    status: "ACTIVE";
    dataSource: typeof HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE;
    propertyType: PropertyType;
    listPrice: number;
    beds: number;
    baths: number;
    sqft: number | null;
    addressLine: string;
    city: string;
    brokerageName: string;
    description: string;
    lat: number;
    lng: number;
    organizationId: null;
    providerKey: typeof HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY;
    listingKey: null;
    isMock: false;
    listedAt: string;
    facts: { waterfront: boolean } | null;
  } | null;
  media: Array<{ url: string; sortOrder: number; isPrimary: boolean }>;
  source: {
    providerKey: typeof HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY;
    providerListingKey: string;
    sourceMlsNumber: string;
    organizationId: null;
    credentialRef: null;
  } | null;
  sourcePhotoCount: number;
  copiedPhotoCount: number;
  omittedPhotoCount: number;
};

function copiedMedia(candidate: StagingSnapshotCandidate) {
  const photos = publicPhotos(candidate)
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .slice(0, NEON_LISTING_MEDIA_CAP);
  const primaryIndex = photos.findIndex((photo) => photo.isPrimary);
  return photos.map((photo, index) => ({
    url: photo.url,
    sortOrder: photo.sortOrder,
    isPrimary: primaryIndex === -1 ? index === 0 : index === primaryIndex,
  }));
}

function canonicalApprovedMls(mlsNumber: string): string | null {
  const key = mlsNumber.trim().toUpperCase();
  return STAGING_SNAPSHOT_ALLOWLIST.has(key) ? key : null;
}

function excludedPlan(
  mlsNumber: string,
  reason: string,
  photoCount = 0,
): SnapshotRecordPlan {
  return {
    mlsNumber,
    slot: "excluded",
    action: "rejected",
    reason,
    listing: null,
    media: [],
    source: null,
    sourcePhotoCount: photoCount,
    copiedPhotoCount: 0,
    omittedPhotoCount: photoCount,
  };
}

/**
 * Keep only the five approved MLS numbers. Field values are not rewritten.
 * An unapproved, duplicate, inactive, unattributed, or photo-less candidate
 * is rejected before slot selection.
 */
function screenStagingSnapshotCandidates(
  candidates: readonly StagingSnapshotCandidate[],
): { approved: StagingSnapshotCandidate[]; excluded: SnapshotRecordPlan[] } {
  const approved: StagingSnapshotCandidate[] = [];
  const excluded: SnapshotRecordPlan[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const mlsNumber = canonicalApprovedMls(candidate.mlsNumber);
    const photoCount = candidate.photoCount;
    if (!mlsNumber) {
      excluded.push(excludedPlan(candidate.mlsNumber.trim(), "unapproved mls number", photoCount));
      continue;
    }
    if (seen.has(mlsNumber)) {
      excluded.push(excludedPlan(mlsNumber, "duplicate candidate", photoCount));
      continue;
    }
    seen.add(mlsNumber);
    if (candidate.status !== "ACTIVE") {
      excluded.push(excludedPlan(mlsNumber, "listing is not active", photoCount));
      continue;
    }
    if (!candidate.brokerageName.trim()) {
      excluded.push(excludedPlan(mlsNumber, "missing listing brokerage attribution", photoCount));
      continue;
    }
    if (publicPhotos(candidate).length === 0) {
      excluded.push(excludedPlan(mlsNumber, "missing public image metadata", photoCount));
      continue;
    }
    approved.push({ ...candidate, mlsNumber });
  }
  return { approved, excluded };
}

/**
 * Build the staging insert plan from already loaded candidates.
 * Does not open a connection. Listing facts are copied as given.
 * Only the five approved MLS numbers can become create records.
 */
export function planHighOctaneStagingSnapshot(input: {
  candidates: readonly StagingSnapshotCandidate[];
  existing?: readonly SnapshotExistingListing[];
}): { records: SnapshotRecordPlan[]; manifest: StagingSnapshotManifest } {
  const screened = screenStagingSnapshotCandidates(input.candidates);
  const existing = new Map(
    (input.existing ?? []).map((row) => [row.mlsNumber.trim().toUpperCase(), row.dataSource]),
  );
  const records: SnapshotRecordPlan[] = [];
  const assigned = new Set<string>();
  for (const selection of selectHighOctaneStagingSnapshot(screened.approved)) {
    const candidate = selection.candidate;
    if (!candidate) {
      records.push({
        mlsNumber: "",
        slot: selection.slot,
        action: "rejected",
        reason: selection.reason,
        listing: null,
        media: [],
        source: null,
        sourcePhotoCount: 0,
        copiedPhotoCount: 0,
        omittedPhotoCount: 0,
      });
      continue;
    }
    const mlsNumber = candidate.mlsNumber.trim().toUpperCase();
    assigned.add(mlsNumber);
    const prior = existing.get(mlsNumber);
    if (prior && prior !== HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE) {
      records.push({
        mlsNumber,
        slot: selection.slot,
        action: "rejected",
        reason: "mls number already belongs to another inventory channel",
        listing: null,
        media: [],
        source: null,
        sourcePhotoCount: candidate.photoCount,
        copiedPhotoCount: 0,
        omittedPhotoCount: candidate.photoCount,
      });
      continue;
    }
    const media = copiedMedia(candidate);
    const record: SnapshotRecordPlan = {
      mlsNumber,
      slot: selection.slot,
      action: prior === HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE ? "already_present" : "create",
      reason: prior === HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE ? "already_present" : "create",
      listing: {
        mlsNumber,
        status: "ACTIVE",
        dataSource: HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE,
        propertyType: candidate.propertyType,
        listPrice: candidate.listPrice,
        beds: candidate.beds,
        baths: candidate.baths,
        sqft: candidate.sqft,
        addressLine: candidate.addressLine,
        city: candidate.city,
        brokerageName: candidate.brokerageName,
        description: candidate.description,
        lat: candidate.lat,
        lng: candidate.lng,
        organizationId: null,
        providerKey: HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY,
        listingKey: null,
        isMock: false,
        listedAt: candidate.listedAt,
        facts: candidate.waterfront === null ? null : { waterfront: candidate.waterfront },
      },
      media,
      source: {
        providerKey: HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY,
        providerListingKey: candidate.providerListingKey,
        sourceMlsNumber: mlsNumber,
        organizationId: null,
        credentialRef: null,
      },
      sourcePhotoCount: candidate.photoCount,
      copiedPhotoCount: media.length,
      omittedPhotoCount: Math.max(0, candidate.photoCount - media.length),
    };
    records.push(record);
  }
  for (const candidate of screened.approved) {
    const mlsNumber = candidate.mlsNumber.trim().toUpperCase();
    if (assigned.has(mlsNumber)) continue;
    records.push(
      excludedPlan(
        mlsNumber,
        "not assigned to a review slot",
        candidate.photoCount,
      ),
    );
  }
  records.push(...screened.excluded);
  return { records, manifest: buildStagingSnapshotManifest(records) };
}

export type StagingSnapshotManifest = {
  dataSource: typeof HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE;
  providerKey: typeof HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY;
  workspaceSlug: typeof HIGH_OCTANE_STAGING_WORKSPACE_SLUG;
  mlsNumbers: string[];
  mediaUrls: string[];
  recognizedMlsProvider: typeof CURRENT_PROPTX_PROVIDER_KEY;
};

export function buildStagingSnapshotManifest(
  records: readonly SnapshotRecordPlan[],
): StagingSnapshotManifest {
  const kept = records.filter((record) => record.action !== "rejected" && record.mlsNumber);
  return {
    dataSource: HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE,
    providerKey: HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY,
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    mlsNumbers: kept.map((record) => record.mlsNumber),
    mediaUrls: kept.flatMap((record) => record.media.map((photo) => photo.url)),
    recognizedMlsProvider: CURRENT_PROPTX_PROVIDER_KEY,
  };
}

export function snapshotDetailAllows(input: {
  dataSource: string | null | undefined;
  status: string;
  visible: boolean;
  additionalCapabilities?: readonly string[];
}): boolean {
  if (!isHighOctaneStagingSnapshotDataSource(input.dataSource)) return false;
  if (!input.visible || input.status !== "ACTIVE") return false;
  return !(input.additionalCapabilities ?? []).some((capability) =>
    BLOCKED_DETAIL_CAPABILITIES.has(capability),
  );
}

export type StagingSnapshotWriteClient = {
  query: (sql: string) => Promise<{ rows: StagingSnapshotBranchRow[] }>;
  listing: {
    create: (args: { data: Prisma.ListingUncheckedCreateInput }) => Promise<{ id: string }>;
  };
  listingMedia: {
    create: (args: { data: Prisma.ListingMediaUncheckedCreateInput }) => Promise<{ id: string }>;
  };
  listingSource: {
    create: (args: { data: Prisma.ListingSourceUncheckedCreateInput }) => Promise<{ id: string }>;
  };
};

/**
 * Later authorized write. Refuses production and any plan that is not a fresh create.
 * The dry-run CLI does not call this.
 */
export async function applyHighOctaneStagingSnapshot(input: {
  confirmation: string;
  env?: NodeJS.ProcessEnv;
  records: readonly SnapshotRecordPlan[];
  writer: {
    transaction: <T>(fn: (tx: StagingSnapshotWriteClient) => Promise<T>) => Promise<T>;
  };
}): Promise<{ applied: number }> {
  if (input.confirmation !== HIGH_OCTANE_STAGING_SNAPSHOT_CONFIRMATION) {
    throw new Error("staging snapshot write refused");
  }
  if (!evaluateHighOctaneStagingEnvironment(input.env ?? process.env).ready) {
    throw new Error("staging snapshot write refused");
  }
  const creates = input.records.filter((record) => record.action === "create");
  if (creates.length === 0 || creates.some((record) => !record.listing || !record.source)) {
    throw new Error("staging snapshot write refused");
  }
  if (
    creates.some(
      (record) =>
        record.mlsNumber.trim().toUpperCase() !== record.listing?.mlsNumber.trim().toUpperCase() ||
        !STAGING_SNAPSHOT_ALLOWLIST.has(record.mlsNumber.trim().toUpperCase()) ||
        record.listing?.organizationId !== null ||
        record.listing?.dataSource !== HIGH_OCTANE_STAGING_SNAPSHOT_DATA_SOURCE ||
        record.listing?.providerKey !== HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY ||
        record.source?.providerKey !== HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY ||
        record.source?.credentialRef !== null,
    )
  ) {
    throw new Error("staging snapshot write refused");
  }
  return input.writer.transaction(async (tx) => {
    await assertHighOctaneStagingSnapshotBranch((sql) => tx.query(sql));
    for (const record of creates) {
      const listing = record.listing;
      const source = record.source;
      if (!listing || !source) throw new Error("staging snapshot write refused");
      const created = await tx.listing.create({
        data: {
          mlsNumber: listing.mlsNumber,
          status: listing.status,
          dataSource: listing.dataSource,
          propertyType: listing.propertyType,
          listPrice: listing.listPrice,
          beds: listing.beds,
          baths: listing.baths,
          sqft: listing.sqft,
          addressLine: listing.addressLine,
          city: listing.city,
          brokerageName: listing.brokerageName,
          description: listing.description,
          lat: listing.lat,
          lng: listing.lng,
          organizationId: null,
          providerKey: HIGH_OCTANE_STAGING_SNAPSHOT_PROVIDER_KEY,
          listingKey: null,
          isMock: false,
          facts: listing.facts ?? undefined,
          listedAt: new Date(listing.listedAt),
          updatedAtMls: new Date(listing.listedAt),
        },
      });
      for (const photo of record.media) {
        await tx.listingMedia.create({
          data: {
            listingId: created.id,
            url: photo.url,
            sortOrder: photo.sortOrder,
            isPrimary: photo.isPrimary,
          },
        });
      }
      await tx.listingSource.create({
        data: {
          listingId: created.id,
          providerKey: source.providerKey,
          providerListingKey: source.providerListingKey,
          sourceMlsNumber: source.sourceMlsNumber,
          organizationId: null,
          isPrimary: true,
        },
      });
    }
    return { applied: creates.length };
  });
}
