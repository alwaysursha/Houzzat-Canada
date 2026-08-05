import { notFound, permanentRedirect } from "next/navigation";
import { getListingProvider } from "@/lib/listings/provider";
import { listingPath } from "@/lib/listings/listing-path";
import { lookupAndUpsertOnDemand } from "@/lib/proptx/on-demand-lookup";

type Params = { params: Promise<{ mlsNumber: string }> };

/**
 * Legacy MLS-only URLs → 301 to address+city slug path for SEO.
 * `/listing/X13637722` → `/listing/62-balsam-street-…-waterloo/X13637722`
 */
export default async function LegacyListingMlsRedirect({ params }: Params) {
  const { mlsNumber } = await params;
  const provider = getListingProvider();
  let listing = await provider.getByMls(mlsNumber);
  if (!listing) {
    const pulled = await lookupAndUpsertOnDemand(mlsNumber);
    if (pulled.mlsNumbers.length > 0) {
      listing = await provider.getByMls(mlsNumber);
    }
  }
  if (!listing) notFound();
  permanentRedirect(listingPath(listing));
}
