import { prisma } from "@/lib/prisma";
import {
  getTypesenseAdminClient,
  getTypesenseCollectionName,
} from "@/lib/typesense/client";
import { typesenseEnv, typesenseFlagEnabled } from "@/lib/typesense/env";
import { listingToTypesenseDocument } from "@/lib/typesense/listing-document";
import { ensureTypesenseListingProvenanceFields } from "@/lib/typesense/listing-provenance-fields";
import { gateMlsTypesenseDocument } from "@/lib/typesense/mls-write-gate";

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

export type TypesenseListingSyncFailureReason =
  | "disabled"
  | "not_found"
  | "mock"
  | "missing_provenance"
  | "sak_mismatch"
  | "error";

export type TypesenseListingSyncResult =
  | { ok: true }
  | { ok: false; reason: TypesenseListingSyncFailureReason };

/**
 * Upsert one Neon listing into Typesense via the canonical mapper.
 * MLS docs without canonical org/provider/SAK are refused (no partial emplace).
 * FSBO/manual without MLS provenance still write (no invented board identity).
 */
export async function syncListingToTypesense(
  listingId: string,
): Promise<TypesenseListingSyncResult> {
  if (!isTypesenseSyncEnabled()) {
    return { ok: false, reason: "disabled" };
  }

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
    if (!listing) return { ok: false, reason: "not_found" };
    if (listing.isMock) return { ok: false, reason: "mock" };

    const document = listingToTypesenseDocument(listing);
    const gate = gateMlsTypesenseDocument({
      dataSource: listing.dataSource,
      organizationId: listing.organizationId,
      providerKey: listing.providerKey,
      document,
    });
    if (!gate.allow) {
      console.error(
        "[typesense/sync] refusing MLS upsert:",
        gate.reason,
        listing.mlsNumber,
        listingId,
      );
      return { ok: false, reason: gate.reason };
    }

    await ensureBedsLabelField();
    await ensureLivingAreaRangeField();
    await ensureProvenanceFields();

    const client = getTypesenseAdminClient();
    const collection = getTypesenseCollectionName();

    // Full canonical document (mapper includes OH fields + provenance).
    // Never send a provenance-less MLS body — that would strip SAK on emplace.
    await client
      .collections(collection)
      .documents()
      .create(document, { action: "emplace" });
    return { ok: true };
  } catch (error) {
    console.error("[typesense/sync]", listingId, error);
    return { ok: false, reason: "error" };
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
