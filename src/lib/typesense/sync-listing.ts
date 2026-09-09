import { prisma } from "@/lib/prisma";
import {
  getTypesenseAdminClient,
  getTypesenseCollectionName,
} from "@/lib/typesense/client";
import { typesenseEnv, typesenseFlagEnabled } from "@/lib/typesense/env";
import {
  buildListingSourceAuthorityKey,
  listingToTypesenseDocument,
} from "@/lib/typesense/listing-document";
import { ensureTypesenseListingProvenanceFields } from "@/lib/typesense/listing-provenance-fields";

let bedsLabelFieldEnsured = false;
let livingAreaRangeFieldEnsured = false;
let provenanceFieldsEnsured = false;

async function ensureBedsLabelField(): Promise<void> {
  if (bedsLabelFieldEnsured) return;
  try {
    const client = getTypesenseAdminClient();
    const collection = getTypesenseCollectionName();
    await client.collections(collection).update({
      fields: [{ name: "bedsLabel", type: "string", optional: true }],
    });
  } catch (error) {
    // Already exists / permission — keep syncing; upserts still work once present.
    console.warn("[typesense/sync] bedsLabel field ensure:", error);
  }
  bedsLabelFieldEnsured = true;
}

async function ensureLivingAreaRangeField(): Promise<void> {
  if (livingAreaRangeFieldEnsured) return;
  try {
    const client = getTypesenseAdminClient();
    const collection = getTypesenseCollectionName();
    await client.collections(collection).update({
      fields: [{ name: "livingAreaRange", type: "string", optional: true }],
    });
  } catch (error) {
    console.warn("[typesense/sync] livingAreaRange field ensure:", error);
  }
  livingAreaRangeFieldEnsured = true;
}

async function ensureProvenanceFields(): Promise<void> {
  if (provenanceFieldsEnsured) return;
  try {
    const client = getTypesenseAdminClient();
    const collection = getTypesenseCollectionName();
    await ensureTypesenseListingProvenanceFields({
      client,
      collectionName: collection,
    });
  } catch (error) {
    console.warn("[typesense/sync] provenance field ensure:", error);
  }
  provenanceFieldsEnsured = true;
}

/** Why Typesense writes are off, or null when they can run. */
export function typesenseSyncDisabledReason(): string | null {
  const flag = typesenseEnv("TYPESENSE_SYNC");
  if (flag === "0" || flag === "false") {
    return "TYPESENSE_SYNC is 0";
  }
  const hasHost = Boolean(typesenseEnv("TYPESENSE_HOST"));
  const hasAdmin = Boolean(typesenseEnv("TYPESENSE_ADMIN_API_KEY"));
  if (!hasHost) return "TYPESENSE_HOST missing";
  if (!hasAdmin) return "TYPESENSE_ADMIN_API_KEY missing";
  if (flag === "1" || flag === "true") return null;
  if (
    typesenseFlagEnabled("TYPESENSE_SEARCH") ||
    typesenseFlagEnabled("TYPESENSE_AUTOCOMPLETE")
  ) {
    return null;
  }
  return "TYPESENSE_SYNC is not 1 (and TYPESENSE_SEARCH is off)";
}

export function isTypesenseSyncEnabled(): boolean {
  return typesenseSyncDisabledReason() === null;
}

/**
 * Upsert one Neon listing into Typesense. Best-effort — never throws to callers.
 * Always writes organizationId/providerKey/sourceAuthorityKey when Neon has them
 * so G.10 entitlement filters stay accurate.
 */
export async function syncListingToTypesense(
  listingId: string,
): Promise<boolean> {
  if (!isTypesenseSyncEnabled()) return false;

  try {
    const now = new Date();
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: {
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
        isMock: true,
        dataSource: true,
        organizationId: true,
        providerKey: true,
        media: {
          select: { url: true, isPrimary: true, sortOrder: true },
          orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          take: 1,
        },
        openHouses: {
          where: { endsAt: { gte: now } },
          orderBy: { startsAt: "asc" },
          take: 8,
          select: { startsAt: true, endsAt: true },
        },
      },
    });
    if (!listing || listing.isMock) return false;

    await ensureBedsLabelField();
    await ensureLivingAreaRangeField();
    await ensureProvenanceFields();

    const expectedSak = buildListingSourceAuthorityKey(
      listing.organizationId,
      listing.providerKey,
    );
    if (!expectedSak && listing.dataSource === "mls") {
      console.warn(
        "[typesense/sync] MLS listing missing Neon provenance; Typesense doc will lack sourceAuthorityKey",
        listing.mlsNumber,
        listingId,
      );
    }

    const client = getTypesenseAdminClient();
    const collection = getTypesenseCollectionName();
    const document = listingToTypesenseDocument(listing);

    if (expectedSak && document.sourceAuthorityKey !== expectedSak) {
      console.error(
        "[typesense/sync] refusing upsert without sourceAuthorityKey",
        listing.mlsNumber,
        listingId,
      );
      return false;
    }

    // emplace: create or merge fields — never wipe sourceAuthorityKey when an
    // older sync host upserts a partial doc without provenance.
    await client
      .collections(collection)
      .documents()
      .create(document, { action: "emplace" });
    return true;
  } catch (error) {
    console.error("[typesense/sync]", listingId, error);
    return false;
  }
}

/** Remove a listing from Typesense (e.g. hard-delete). Best-effort. */
export async function deleteListingFromTypesense(
  mlsNumber: string,
): Promise<void> {
  if (!isTypesenseSyncEnabled() || !mlsNumber.trim()) return;
  try {
    const client = getTypesenseAdminClient();
    const collection = getTypesenseCollectionName();
    await client
      .collections(collection)
      .documents(mlsNumber.trim())
      .delete();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!/404|Not Found/i.test(msg)) {
      console.error("[typesense/delete]", mlsNumber, error);
    }
  }
}
