/**
 * Share payload for a single listing (Email / Text / WhatsApp / copy link).
 */

import { formatListingPrice } from "./property-response";
import type { MobileListingCard, MobilePropertyDetail } from "../types/property";

export const LISTING_PUBLIC_ORIGIN = "https://app.houzzatpro.com";

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
  beds?: number;
  baths?: number;
  bedsLabel?: string | null;
  sqftLabel?: string | null;
};

export function buildPublicListingUrl(mlsNumber: string): string {
  const mls = mlsNumber.trim().toUpperCase();
  return `${LISTING_PUBLIC_ORIGIN}/listing/${encodeURIComponent(mls)}`;
}

export function listingShareInputFromCard(
  card: MobileListingCard,
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
  };
}

export function listingShareInputFromDetail(
  detail: MobilePropertyDetail,
): ListingShareInput {
  return {
    mlsNumber: detail.mlsNumber,
    listPrice: detail.listPrice,
    transactionType: detail.transactionType,
    addressLine: detail.addressLine,
    unitNumber: detail.unitNumber,
    city: detail.city,
    beds: detail.beds,
    baths: detail.baths,
    bedsLabel: detail.bedsLabel,
    sqftLabel: detail.sqftLabel,
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
  const url = buildPublicListingUrl(input.mlsNumber);
  const price = formatListingPrice(input.listPrice, input.transactionType);
  const address = formatShareAddress(input);
  const mls = input.mlsNumber.trim().toUpperCase();

  const facts: string[] = [];
  const beds = input.bedsLabel?.trim() || (input.beds != null ? String(input.beds) : "");
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
