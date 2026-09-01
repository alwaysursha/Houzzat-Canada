/**
 * Engagement match → property card helpers (detail modal + search parity).
 */

import type { MobileLeadEngagementMatch } from "../types/lead";
import type { MobileListingCard } from "../types/property";

export function engagementMatchToListingCard(
  match: MobileLeadEngagementMatch,
): MobileListingCard {
  return {
    mlsNumber: match.mlsNumber,
    status: match.status,
    transactionType: match.transactionType,
    propertyType: match.propertyType,
    listPrice: match.listPrice ?? 0,
    soldPrice: null,
    beds: match.beds,
    bedsLabel: match.bedsLabel,
    baths: match.baths,
    sqft: null,
    addressLine: match.addressLine,
    unitNumber: match.unitNumber,
    city: match.city,
    community: match.community,
    primaryImageUrl: match.primaryImageUrl ?? match.imageUrl,
    daysOnMarket: match.daysOnMarket,
    listedAt: match.listedAt,
    soldAt: match.soldAt,
    timingLabel: match.timingLabel,
  };
}
