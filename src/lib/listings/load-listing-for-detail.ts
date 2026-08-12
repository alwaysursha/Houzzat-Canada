import { getListingProvider } from "@/lib/listings/provider";
import type { ListingDetail } from "@/lib/listings/types";
import { lookupAndUpsertOnDemand } from "@/lib/proptx/on-demand-lookup";

/**
 * Lean listing load shared by /listing/... RSC and GET /api/listings/[mls]/panel.
 * Neon media ≤5, price-change history ≤5, no rooms / open houses.
 * Auth and VOW stay outside — this is MLS inventory only.
 */
export async function loadListingForDetailPage(
  mlsNumberRaw: string,
): Promise<ListingDetail | null> {
  const mlsNumber = mlsNumberRaw.trim().toUpperCase();
  if (!mlsNumber) return null;

  const provider = getListingProvider();
  let listing = await provider.getByMlsForDetailPage(mlsNumber);
  if (!listing) {
    const pulled = await lookupAndUpsertOnDemand(mlsNumber);
    if (pulled.mlsNumbers.length > 0) {
      listing = await provider.getByMlsForDetailPage(mlsNumber);
    }
  }
  return listing;
}
