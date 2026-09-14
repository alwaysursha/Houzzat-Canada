/**
 * Share payload for a single listing (Email / Text / WhatsApp / copy link).
 * Links use the workspace consumer site + canonical /listing/{slug}/{mls} path.
 */

import { formatListingPrice } from "./property-response";
import type { MobileListingCard, MobilePropertyDetail } from "../types/property";

export type ListingShareChannel =
  | "email"
  | "sms"
  | "whatsapp"
  | "copy_link";

export type ListingShareInput = {
  mlsNumber: string;
  listPrice: number;
  transactionType: string;
  addressLine: string;
  unitNumber?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  beds?: number;
  baths?: number;
  bedsLabel?: string | null;
  sqftLabel?: string | null;
  /** Server-built absolute URL when detail is loaded. */
  shareUrl?: string | null;
  /** Workspace consumer origin, e.g. https://houzzat.com */
  publicOrigin?: string | null;
};

function slugifySegment(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Mirror of src/lib/listings/listing-path.ts listingAddressSlug (street + city). */
export function listingAddressSlug(input: {
  addressLine: string;
  unitNumber?: string | null;
  city?: string | null;
}): string {
  let street = input.addressLine.trim().replace(/,+\s*$/g, "");
  const unit = input.unitNumber?.trim();
  const city = input.city?.trim() || "listing";
  if (unit) {
    const unitAlready =
      new RegExp(`\\b(?:unit\\s*)?${unit}\\b`, "i").test(street) ||
      new RegExp(`\\b${unit}\\s*$`, "i").test(street);
    if (!unitAlready) street = `${street} Unit ${unit}`;
  }
  return `${slugifySegment(street)}-${slugifySegment(city)}`
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export function buildListingSharePath(input: {
  mlsNumber: string;
  addressLine: string;
  unitNumber?: string | null;
  city?: string | null;
}): string {
  const slug = listingAddressSlug(input) || "listing";
  const mls = input.mlsNumber.trim().toUpperCase();
  return `/listing/${slug}/${encodeURIComponent(mls)}`;
}

export function buildPublicListingUrl(input: ListingShareInput): string {
  if (input.shareUrl?.trim()) {
    return input.shareUrl.trim().replace(/\/$/, "");
  }
  const origin = (input.publicOrigin?.trim() || "").replace(/\/$/, "");
  const path = buildListingSharePath({
    mlsNumber: input.mlsNumber,
    addressLine: input.addressLine,
    unitNumber: input.unitNumber,
    city: input.city,
  });
  if (origin) return `${origin}${path}`;
  // Last-resort relative path — still better than app.houzzatpro.com/listing/MLS
  return path;
}

export function listingShareInputFromCard(
  card: MobileListingCard,
  opts?: { publicOrigin?: string | null },
): ListingShareInput {
  return {
    mlsNumber: card.mlsNumber,
    listPrice: card.listPrice,
    transactionType: card.transactionType,
    addressLine: card.addressLine,
    unitNumber: card.unitNumber,
    city: card.city,
    beds: card.beds,
    baths: card.baths,
    bedsLabel: card.bedsLabel,
    publicOrigin: opts?.publicOrigin,
  };
}

export function listingShareInputFromDetail(
  detail: MobilePropertyDetail,
  opts?: { publicOrigin?: string | null },
): ListingShareInput {
  return {
    mlsNumber: detail.mlsNumber,
    listPrice: detail.listPrice,
    transactionType: detail.transactionType,
    addressLine: detail.addressLine,
    unitNumber: detail.unitNumber,
    city: detail.city,
    province: detail.province,
    postalCode: detail.postalCode,
    beds: detail.beds,
    baths: detail.baths,
    bedsLabel: detail.bedsLabel,
    sqftLabel: detail.sqftLabel,
    shareUrl: detail.shareUrl,
    publicOrigin: detail.publicOrigin ?? opts?.publicOrigin,
  };
}

function formatShareAddress(input: ListingShareInput): string {
  const street = input.unitNumber?.trim()
    ? `${input.unitNumber.trim()} - ${input.addressLine}`
    : input.addressLine;
  return [street, input.city?.trim()].filter(Boolean).join(", ");
}

export function buildListingShareMessage(input: ListingShareInput): {
  subject: string;
  body: string;
  url: string;
} {
  const url = buildPublicListingUrl(input);
  const price = formatListingPrice(input.listPrice, input.transactionType);
  const address = formatShareAddress(input);
  const mls = input.mlsNumber.trim().toUpperCase();

  const facts: string[] = [];
  const beds =
    input.bedsLabel?.trim() || (input.beds != null ? String(input.beds) : "");
  if (beds) facts.push(`${beds} bed`);
  if (input.baths != null && input.baths > 0) facts.push(`${input.baths} bath`);
  if (input.sqftLabel?.trim()) facts.push(input.sqftLabel.trim());

  const lines = [
    price,
    address,
    facts.length > 0 ? facts.join(" · ") : null,
    `MLS® #${mls}`,
    "",
    url,
  ].filter((line): line is string => line != null);

  return {
    subject: `${address} · MLS® #${mls}`,
    body: lines.join("\n"),
    url,
  };
}
