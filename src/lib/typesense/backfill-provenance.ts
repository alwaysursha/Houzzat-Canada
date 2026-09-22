import { prisma } from "@/lib/prisma";
import {
  getTypesenseAdminClient,
  getTypesenseCollectionName,
} from "@/lib/typesense/client";
import {
  buildListingSourceAuthorityKey,
  listingToTypesenseDocument,
} from "@/lib/typesense/listing-document";
import { ensureTypesenseListingProvenanceFields } from "@/lib/typesense/listing-provenance-fields";
import { typesenseEnv } from "@/lib/typesense/env";
import { assertMlsSyncExecutionHost } from "@/lib/proptx/mls-sync-host";

export type TypesenseProvenanceBackfillResult = {
  ok: boolean;
  collection: string;
  imported: number;
  failed: number;
  skippedNoSak: number;
  target: number;
};

/**
 * Upsert Neon attributable listings into Typesense with organizationId /
 * providerKey / sourceAuthorityKey. Used by one-shot scripts and post-MLS-sync heal.
 */
export async function backfillTypesenseListingProvenance(options?: {
  batchSize?: number;
  /** When > 0, only rows with listedAt within the last N days. */
  sinceDays?: number | null;
  maxRows?: number | null;
}): Promise<TypesenseProvenanceBackfillResult> {
  assertMlsSyncExecutionHost();
  const hasCreds = Boolean(
    typesenseEnv("TYPESENSE_HOST") && typesenseEnv("TYPESENSE_ADMIN_API_KEY"),
  );
  if (!hasCreds) {
    return {
      ok: false,
      collection: "",
      imported: 0,
      failed: 0,
      skippedNoSak: 0,
      target: 0,
    };
  }

  const batchSize = Math.max(1, options?.batchSize ?? 250);
  const sinceDays =
    options?.sinceDays == null || options.sinceDays <= 0
      ? null
      : Math.max(0, options.sinceDays);
  const maxRows = options?.maxRows ?? null;

  const client = getTypesenseAdminClient();
  const collection = getTypesenseCollectionName();

  await ensureTypesenseListingProvenanceFields({
    client,
    collectionName: collection,
  });

  const since =
    sinceDays != null
      ? new Date(Date.now() - sinceDays * 86_400_000)
      : null;

  const where = {
    isMock: false,
    organizationId: { not: null },
    providerKey: { not: null },
    ...(since ? { listedAt: { gte: since } } : {}),
  };

  const totalMatching = await prisma.listing.count({ where });
  const target =
    maxRows == null ? totalMatching : Math.min(maxRows, totalMatching);

  let imported = 0;
  let failed = 0;
  let skippedNoSak = 0;
  let cursor: string | undefined;

  while (imported + failed + skippedNoSak < target) {
    const take = Math.min(batchSize, target - imported - failed - skippedNoSak);
    const rows = await prisma.listing.findMany({
      where,
      orderBy: { id: "asc" },
      take,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
      select: {
        id: true,
        mlsNumber: true,
        addressLine: true,
        unitNumber: true,
        city: true,
        community: true,
        postalCode: true,
        province: true,
        status: true,
        segment: true,
        transactionType: true,
        propertyType: true,
        listPrice: true,
        soldPrice: true,
        beds: true,
        baths: true,
        sqft: true,
        parkingSpaces: true,
        listedAt: true,
        updatedAtMls: true,
        daysOnMarket: true,
        brokerageName: true,
        lat: true,
        lng: true,
        facts: true,
        organizationId: true,
        providerKey: true,
        media: {
          select: { url: true, isPrimary: true, sortOrder: true },
          orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          take: 1,
        },
        openHouses: {
          where: { endsAt: { gte: new Date() } },
          orderBy: { startsAt: "asc" },
          take: 8,
          select: { startsAt: true, endsAt: true },
        },
      },
    });

    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]!.id;

    const documents = [];
    for (const row of rows) {
      const sak = buildListingSourceAuthorityKey(
        row.organizationId,
        row.providerKey,
      );
      if (!sak) {
        skippedNoSak += 1;
        continue;
      }
      documents.push(listingToTypesenseDocument(row));
    }

    if (documents.length === 0) continue;

    const results = await client
      .collections(collection)
      .documents()
      .import(documents, { action: "emplace" });

    for (const result of results) {
      if (result.success) imported += 1;
      else {
        failed += 1;
        console.error("[typesense/provenance-backfill] import fail:", result);
      }
    }
  }

  return {
    ok: failed === 0,
    collection,
    imported,
    failed,
    skippedNoSak,
    target,
  };
}
