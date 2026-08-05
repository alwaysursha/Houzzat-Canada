import type {
  ListingStatus,
  ListingTransactionType,
} from "@prisma/client";
import { listingStatusLabel } from "@/lib/listings/constants";
import { SITE_NAME } from "@/lib/constants";

export type ListingPathInput = {
  mlsNumber: string;
  addressLine: string;
  unitNumber?: string | null;
  city: string;
};

/** URL-safe address/city slug for listing detail pages. */
export function listingAddressSlug(listing: {
  addressLine: string;
  unitNumber?: string | null;
  city: string;
}): string {
  const parts = [listing.addressLine];
  if (listing.unitNumber?.trim()) {
    parts.push(`unit-${listing.unitNumber.trim()}`);
  }
  parts.push(listing.city);
  return parts
    .join(" ")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/**
 * Canonical listing path: `/listing/161-eden-oak-trail-kitchener/X13637722`
 * Legacy `/listing/X13637722` is handled by the catch-all listing page (301).
 */
export function listingPath(listing: ListingPathInput): string {
  const slug = listingAddressSlug(listing) || "listing";
  return `/listing/${slug}/${listing.mlsNumber}`;
}

/** Browser/SEO title: `For Sale: 161 Eden Oak Trail, Kitchener | Houzzat` */
export function listingPageTitle(listing: {
  addressLine: string;
  unitNumber?: string | null;
  city: string;
  status: ListingStatus;
  transactionType: ListingTransactionType | string;
}): string {
  const tag = listingStatusLabel(listing.status, listing.transactionType);
  const street = listing.unitNumber?.trim()
    ? `${listing.addressLine} Unit ${listing.unitNumber.trim()}`
    : listing.addressLine;
  return `${tag}: ${street}, ${listing.city} | ${SITE_NAME}`;
}
