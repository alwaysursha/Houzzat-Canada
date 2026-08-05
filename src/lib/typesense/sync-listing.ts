import { prisma } from "@/lib/prisma";
import {
  getTypesenseAdminClient,
  getTypesenseCollectionName,
} from "@/lib/typesense/client";
import { typesenseEnv, typesenseFlagEnabled } from "@/lib/typesense/env";
import { listingToTypesenseDocument } from "@/lib/typesense/listing-document";

function isTypesenseSyncEnabled(): boolean {
  const flag = typesenseEnv("TYPESENSE_SYNC");
  if (flag === "0" || flag === "false") return false;
  const hasCreds = Boolean(
    typesenseEnv("TYPESENSE_HOST") && typesenseEnv("TYPESENSE_ADMIN_API_KEY"),
  );
  if (flag === "1" || flag === "true") return hasCreds;
  // Auto-on when search/autocomplete is enabled and admin credentials exist.
  return (
    hasCreds &&
    (typesenseFlagEnabled("TYPESENSE_SEARCH") ||
      typesenseFlagEnabled("TYPESENSE_AUTOCOMPLETE"))
  );
}

/**
 * Upsert one Neon listing into Typesense. Best-effort — never throws to callers.
 */
export async function syncListingToTypesense(
  listingId: string,
): Promise<boolean> {
  if (!isTypesenseSyncEnabled()) return false;

  try {
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
        isMock: true,
        media: {
          select: { url: true, isPrimary: true, sortOrder: true },
          orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          take: 1,
        },
      },
    });
    if (!listing || listing.isMock) return false;

    const client = getTypesenseAdminClient();
    const collection = getTypesenseCollectionName();
    const document = listingToTypesenseDocument(listing);
    await client.collections(collection).documents().upsert(document);
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
    // 404 = already gone
    const msg = error instanceof Error ? error.message : String(error);
    if (!/404|Not Found/i.test(msg)) {
      console.error("[typesense/delete]", mlsNumber, error);
    }
  }
}
