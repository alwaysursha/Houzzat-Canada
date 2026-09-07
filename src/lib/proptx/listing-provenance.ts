/**
 * Stage 6.11G.8B — PropTx / AMPRE listing provenance (feed-bound, NOT workspace-bound).
 *
 * PropTx/AMPRE record → TRREB organization + providerKey "proptx" → shared Listing warehouse.
 *
 * Does NOT consult Workspace, DataConnection, membership, hostname, or
 * resolveAuthoritativeWorkspaceFromHost. Tenant entitlement is a later stage.
 *
 * Neon-safe: no $transaction / updateMany. Sequential idempotent writes.
 * Shared helpers are intended for future historical backfill reuse.
 */
import type { PrismaClient } from "@prisma/client";
import {
  CURRENT_PROPTX_PROVIDER_KEY,
  PROPTX_PROVIDER_LISTING_KEY_FIELD,
} from "@/lib/tenancy/listing-provenance";

/** Durable directory slug — never hardcode production cuid. */
export const PROPTX_TRREB_ORGANIZATION_SLUG = "ca-on-trreb" as const;

export const PROPTX_LISTING_PROVIDER_KEY = CURRENT_PROPTX_PROVIDER_KEY;

export type PropTxListingProvenance = {
  organizationId: string;
  organizationSlug: typeof PROPTX_TRREB_ORGANIZATION_SLUG;
  providerKey: typeof PROPTX_LISTING_PROVIDER_KEY;
};

export type PropTxProvenanceConflictCode =
  | "directory_missing"
  | "directory_inactive"
  | "directory_invalid"
  | "missing_listing_key"
  | "mirror_organization_conflict"
  | "mirror_provider_conflict"
  | "source_field_conflict"
  | "primary_source_conflict"
  | "listing_key_identity_conflict";

export class PropTxProvenanceError extends Error {
  readonly code: PropTxProvenanceConflictCode;
  readonly context: Record<string, string | null | undefined>;

  constructor(
    code: PropTxProvenanceConflictCode,
    message: string,
    context: Record<string, string | null | undefined> = {},
  ) {
    super(message);
    this.name = "PropTxProvenanceError";
    this.code = code;
    this.context = context;
  }
}

export type RealEstateOrganizationProvenanceRow = {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  countryCode: string;
  regionCode: string | null;
  kind: string;
  supportStatus: string;
  active: boolean;
};

export type ListingSourceProvenanceRow = {
  id: string;
  listingId: string;
  organizationId: string | null;
  providerKey: string;
  providerListingKey: string;
  sourceMlsNumber: string | null;
  isPrimary: boolean;
};

export type PropTxProvenanceStore = {
  findOrganizationBySlug: (
    slug: string,
  ) => Promise<RealEstateOrganizationProvenanceRow | null>;
  findListingSources: (
    listingId: string,
  ) => Promise<ListingSourceProvenanceRow[]>;
  createListingSource: (data: {
    listingId: string;
    organizationId: string;
    providerKey: string;
    providerListingKey: string;
    sourceMlsNumber: string;
    isPrimary: true;
  }) => Promise<{ id: string }>;
  updateListingMirrors: (
    listingId: string,
    data: { organizationId: string; providerKey: string },
  ) => Promise<void>;
};

export function createPrismaPropTxProvenanceStore(
  prisma: PrismaClient,
): PropTxProvenanceStore {
  return {
    findOrganizationBySlug: async (slug) =>
      prisma.realEstateOrganization.findUnique({
        where: { slug },
        select: {
          id: true,
          slug: true,
          name: true,
          shortName: true,
          countryCode: true,
          regionCode: true,
          kind: true,
          supportStatus: true,
          active: true,
        },
      }),
    findListingSources: async (listingId) =>
      prisma.listingSource.findMany({
        where: { listingId },
        select: {
          id: true,
          listingId: true,
          organizationId: true,
          providerKey: true,
          providerListingKey: true,
          sourceMlsNumber: true,
          isPrimary: true,
        },
      }),
    createListingSource: async (data) =>
      prisma.listingSource.create({
        data: {
          listingId: data.listingId,
          organizationId: data.organizationId,
          providerKey: data.providerKey,
          providerListingKey: data.providerListingKey,
          sourceMlsNumber: data.sourceMlsNumber,
          isPrimary: true,
        },
        select: { id: true },
      }),
    updateListingMirrors: async (listingId, data) => {
      await prisma.listing.update({
        where: { id: listingId },
        data: {
          organizationId: data.organizationId,
          providerKey: data.providerKey,
        },
      });
    },
  };
}

function assertCanonicalTrrebRow(
  row: RealEstateOrganizationProvenanceRow,
): void {
  if (!row.active) {
    throw new PropTxProvenanceError(
      "directory_inactive",
      `RealEstateOrganization "${PROPTX_TRREB_ORGANIZATION_SLUG}" is inactive`,
      { organizationId: row.id, slug: row.slug },
    );
  }
  if (row.slug !== PROPTX_TRREB_ORGANIZATION_SLUG) {
    throw new PropTxProvenanceError(
      "directory_invalid",
      "Resolved organization slug mismatch",
      { organizationId: row.id, slug: row.slug },
    );
  }
  if (
    row.countryCode !== "CA" ||
    row.regionCode !== "ON" ||
    row.kind !== "BOARD" ||
    row.supportStatus !== "SUPPORTED"
  ) {
    throw new PropTxProvenanceError(
      "directory_invalid",
      `Organization "${PROPTX_TRREB_ORGANIZATION_SLUG}" failed canonical TRREB checks`,
      {
        organizationId: row.id,
        countryCode: row.countryCode,
        regionCode: row.regionCode,
        kind: row.kind,
        supportStatus: row.supportStatus,
      },
    );
  }
}

/**
 * Resolve canonical TRREB/PropTx provenance for ingestion.
 * Does not create directory rows. Fail closed when missing/invalid.
 */
export async function resolvePropTxListingProvenance(
  store: PropTxProvenanceStore,
): Promise<PropTxListingProvenance> {
  const row = await store.findOrganizationBySlug(PROPTX_TRREB_ORGANIZATION_SLUG);
  if (!row) {
    throw new PropTxProvenanceError(
      "directory_missing",
      `Required RealEstateOrganization slug "${PROPTX_TRREB_ORGANIZATION_SLUG}" not found — refusing unattributed PropTx MLS writes`,
      { slug: PROPTX_TRREB_ORGANIZATION_SLUG },
    );
  }
  assertCanonicalTrrebRow(row);
  return {
    organizationId: row.id,
    organizationSlug: PROPTX_TRREB_ORGANIZATION_SLUG,
    providerKey: PROPTX_LISTING_PROVIDER_KEY,
  };
}

/** Process-local session: resolve once per sync/on-demand invocation. */
export function createPropTxProvenanceSession(store: PropTxProvenanceStore): {
  get: () => Promise<PropTxListingProvenance>;
} {
  let cached: PropTxListingProvenance | null = null;
  return {
    async get() {
      if (!cached) {
        cached = await resolvePropTxListingProvenance(store);
      }
      return cached;
    },
  };
}

export function assertDurablePropTxListingKey(
  listingKey: string | null | undefined,
  context: Record<string, string | null | undefined> = {},
): string {
  const key = typeof listingKey === "string" ? listingKey.trim() : "";
  if (!key) {
    throw new PropTxProvenanceError(
      "missing_listing_key",
      `PropTx ${PROPTX_PROVIDER_LISTING_KEY_FIELD} missing/blank — refusing fabricated providerListingKey`,
      context,
    );
  }
  return key;
}

export function assertListingMirrorsCompatible(
  provenance: PropTxListingProvenance,
  mirrors: {
    organizationId: string | null;
    providerKey: string | null;
  },
  context: Record<string, string | null | undefined> = {},
): void {
  if (
    mirrors.organizationId != null &&
    mirrors.organizationId !== provenance.organizationId
  ) {
    throw new PropTxProvenanceError(
      "mirror_organization_conflict",
      "Listing.organizationId conflicts with canonical PropTx/TRREB provenance",
      {
        ...context,
        existingOrganizationId: mirrors.organizationId,
        expectedOrganizationId: provenance.organizationId,
      },
    );
  }
  if (
    mirrors.providerKey != null &&
    mirrors.providerKey !== provenance.providerKey
  ) {
    throw new PropTxProvenanceError(
      "mirror_provider_conflict",
      "Listing.providerKey conflicts with canonical PropTx provider",
      {
        ...context,
        existingProviderKey: mirrors.providerKey,
        expectedProviderKey: provenance.providerKey,
      },
    );
  }
}

function isExactCanonicalSource(
  source: ListingSourceProvenanceRow,
  provenance: PropTxListingProvenance,
  providerListingKey: string,
  sourceMlsNumber: string,
): boolean {
  return (
    source.providerKey === provenance.providerKey &&
    source.providerListingKey === providerListingKey &&
    source.organizationId === provenance.organizationId &&
    source.sourceMlsNumber === sourceMlsNumber &&
    source.isPrimary === true
  );
}

function sourceConflictsWithCanonical(
  source: ListingSourceProvenanceRow,
  provenance: PropTxListingProvenance,
  providerListingKey: string,
  sourceMlsNumber: string,
): boolean {
  if (source.providerKey !== provenance.providerKey) return false;
  if (source.providerListingKey !== providerListingKey) return false;
  // Same identity tuple — field mismatch is a conflict.
  return (
    source.organizationId !== provenance.organizationId ||
    source.sourceMlsNumber !== sourceMlsNumber ||
    source.isPrimary !== true
  );
}

export type EnsurePropTxListingProvenanceInput = {
  listingId: string;
  listingKey: string;
  mlsNumber: string;
  /** Current Listing mirrors (may be null). */
  organizationId: string | null;
  providerKey: string | null;
};

/**
 * Ensure canonical PRIMARY ListingSource + Listing mirrors for a PropTx listing.
 * Idempotent / self-healing for null↔canonical partial states. Never overwrites conflicts.
 */
export async function ensurePropTxListingProvenance(
  store: PropTxProvenanceStore,
  provenance: PropTxListingProvenance,
  input: EnsurePropTxListingProvenanceInput,
): Promise<void> {
  const providerListingKey = assertDurablePropTxListingKey(input.listingKey, {
    listingId: input.listingId,
    mlsNumber: input.mlsNumber,
  });
  const sourceMlsNumber = input.mlsNumber.trim();
  const ctx = {
    listingId: input.listingId,
    mlsNumber: sourceMlsNumber,
    providerKey: provenance.providerKey,
  };

  assertListingMirrorsCompatible(
    provenance,
    {
      organizationId: input.organizationId,
      providerKey: input.providerKey,
    },
    ctx,
  );

  const sources = await store.findListingSources(input.listingId);
  const exactCanonical = sources.find((s) =>
    isExactCanonicalSource(
      s,
      provenance,
      providerListingKey,
      sourceMlsNumber,
    ),
  );

  for (const source of sources) {
    if (
      sourceConflictsWithCanonical(
        source,
        provenance,
        providerListingKey,
        sourceMlsNumber,
      )
    ) {
      throw new PropTxProvenanceError(
        "source_field_conflict",
        "ListingSource exists for PropTx key but fields conflict with canonical provenance",
        {
          ...ctx,
          sourceId: source.id,
          providerListingKey,
        },
      );
    }
  }

  for (const source of sources) {
    if (
      source.providerKey === provenance.providerKey &&
      source.providerListingKey !== providerListingKey
    ) {
      throw new PropTxProvenanceError(
        "listing_key_identity_conflict",
        "Existing PropTx ListingSource providerListingKey differs from incoming ListingKey",
        {
          ...ctx,
          sourceId: source.id,
          existingProviderListingKey: source.providerListingKey,
          incomingProviderListingKey: providerListingKey,
        },
      );
    }
  }

  const conflictingPrimary = sources.find((s) => {
    if (!s.isPrimary) return false;
    if (exactCanonical && s.id === exactCanonical.id) return false;
    return true;
  });

  if (conflictingPrimary) {
    throw new PropTxProvenanceError(
      "primary_source_conflict",
      "Another PRIMARY ListingSource exists — refusing silent PropTx replacement",
      {
        ...ctx,
        sourceId: conflictingPrimary.id,
        existingProviderKey: conflictingPrimary.providerKey,
        existingProviderListingKey: conflictingPrimary.providerListingKey,
      },
    );
  }

  if (!exactCanonical) {
    await store.createListingSource({
      listingId: input.listingId,
      organizationId: provenance.organizationId,
      providerKey: provenance.providerKey,
      providerListingKey,
      sourceMlsNumber,
      isPrimary: true,
    });
  }

  if (
    input.organizationId !== provenance.organizationId ||
    input.providerKey !== provenance.providerKey
  ) {
    await store.updateListingMirrors(input.listingId, {
      organizationId: provenance.organizationId,
      providerKey: provenance.providerKey,
    });
  }
}

export function logPropTxProvenanceConflict(
  err: PropTxProvenanceError,
): void {
  console.warn("[proptx-provenance]", {
    code: err.code,
    message: err.message,
    listingId: err.context.listingId ?? null,
    mlsNumber: err.context.mlsNumber ?? null,
    providerKey: err.context.providerKey ?? PROPTX_LISTING_PROVIDER_KEY,
  });
}
