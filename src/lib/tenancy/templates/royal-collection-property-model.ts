/**
 * Display model for Royal Collection property details.
 * Callers pass an already-authorized listing. This module does not query one.
 */
import type { PropertyType } from "@prisma/client";
import {
  formatListPrice,
  formatListingAddressOneLine,
  propertyTypeLabel,
} from "@/lib/listings/constants";
import {
  formatListingSqftLabel,
  parseListingFacts,
  stripApproxPinNote,
  type ListingFacts,
} from "@/lib/listings/facts";

export type RoyalCollectionPropertyFrame = {
  src: string;
  label: string;
  alt: string;
};

export type RoyalCollectionPropertyRow = {
  label: string;
  value: string;
};

export type RoyalCollectionPropertyCopy = {
  eyebrow: string;
  title: string;
  paragraphs: string[];
};

export type RoyalCollectionPropertyModel = {
  kind: "concept" | "listing" | "withheld";
  kicker: string;
  title: string;
  place: string | null;
  lede: string | null;
  frames: readonly RoyalCollectionPropertyFrame[];
  facts: readonly RoyalCollectionPropertyRow[];
  overview: RoyalCollectionPropertyCopy | null;
  highlights: {
    eyebrow: string;
    title: string;
    items: readonly { title: string; copy: string }[];
  } | null;
  rooms: {
    eyebrow: string;
    title: string;
    intro: string | null;
    rows: readonly RoyalCollectionPropertyRow[];
  } | null;
  outdoor: RoyalCollectionPropertyCopy | null;
  location: {
    eyebrow: string;
    title: string;
    label: string;
    detail: string;
    note: string;
  } | null;
  extras: {
    eyebrow: string;
    title: string;
    rows: readonly RoyalCollectionPropertyRow[];
  } | null;
  related: {
    eyebrow: string;
    title: string;
    cards: readonly {
      imageUrl: string | null;
      kicker: string;
      title: string;
      note: string;
    }[];
  } | null;
  attribution: RoyalCollectionPropertyCopy | null;
  contact: {
    eyebrow: string;
    title: string;
    agentName: string;
    brandName: string;
    brokerageName: string;
    phone: string | null;
    email: string | null;
  };
};

export type RoyalCollectionListingSource = {
  mlsNumber: string;
  addressLine?: string | null;
  unitNumber?: string | null;
  city?: string | null;
  community?: string | null;
  province?: string | null;
  postalCode?: string | null;
  listPrice?: number | null;
  soldPrice?: number | null;
  beds?: number | null;
  baths?: number | null;
  propertyType?: PropertyType | null;
  sqft?: number | null;
  parkingSpaces?: number | null;
  taxes?: number | null;
  description?: string | null;
  lat?: number | null;
  lng?: number | null;
  brokerageName?: string | null;
  transactionType?: string | null;
  facts?: unknown;
  rooms?: readonly {
    roomType?: string | null;
    roomLevel?: string | null;
    dimensions?: string | null;
    length?: number | null;
    width?: number | null;
    units?: string | null;
  }[];
};

export type RoyalCollectionListingSite = {
  agentName: string;
  brandName: string;
  brokerageName: string;
  phone: string | null;
  email: string | null;
};

function clean(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function joinList(value: string[] | null | undefined): string | null {
  const text = value?.map((item) => item.trim()).filter(Boolean).join(", ");
  return text || null;
}

function countLabel(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function paragraphsOf(value: string | null | undefined): string[] {
  const cleanText = stripApproxPinNote(value ?? "");
  if (!cleanText) return [];
  return cleanText
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function coordinates(
  lat: number | null | undefined,
  lng: number | null | undefined,
): { lat: number; lng: number } | null {
  if (lat == null || lng == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) return null;
  return { lat, lng };
}

function lotLabel(facts: ListingFacts | null): string | null {
  if (facts?.lotSizeArea == null || !Number.isFinite(facts.lotSizeArea)) return null;
  const units = clean(facts.lotSizeUnits);
  return units ? facts.lotSizeArea + " " + units : String(facts.lotSizeArea);
}

function roomMeasure(room: NonNullable<RoyalCollectionListingSource["rooms"]>[number]): string | null {
  const recorded = clean(room.dimensions);
  if (recorded) return recorded;
  if (
    room.length == null ||
    room.width == null ||
    !Number.isFinite(room.length) ||
    !Number.isFinite(room.width)
  ) {
    return null;
  }
  const units = clean(room.units);
  const size = room.length + " × " + room.width;
  return units ? size + " " + units : size;
}

function contactFor(site: RoyalCollectionListingSite): RoyalCollectionPropertyModel["contact"] {
  return {
    eyebrow: "Private viewing",
    title: "Request a private viewing",
    agentName: clean(site.agentName) ?? "",
    brandName: clean(site.brandName) ?? "",
    brokerageName: clean(site.brokerageName) ?? "",
    phone: clean(site.phone),
    email: clean(site.email),
  };
}

function withheldModel(site: RoyalCollectionListingSite): RoyalCollectionPropertyModel {
  return {
    kind: "withheld",
    kicker: "Registration required",
    title: "This listing is available after you continue.",
    place: null,
    lede: "Address, price, photographs, and remarks stay on the server until you are signed in.",
    frames: [],
    facts: [],
    overview: null,
    highlights: null,
    rooms: null,
    outdoor: null,
    location: null,
    extras: null,
    related: null,
    attribution: null,
    contact: contactFor(site),
  };
}

/**
 * Build the visible property model from an authorized listing.
 * Unsigned viewers receive no listing fields. Locked inactive details are omitted.
 */
export function buildRoyalCollectionListingModel(input: {
  listing: RoyalCollectionListingSource;
  photos: readonly { url: string; label?: string | null }[];
  viewer: { signedIn: boolean; detailsLocked: boolean };
  site: RoyalCollectionListingSite;
}): RoyalCollectionPropertyModel {
  if (!input.viewer.signedIn) return withheldModel(input.site);

  const listing = input.listing;
  const facts = parseListingFacts(listing.facts);
  const locked = input.viewer.detailsLocked;
  const city = clean(listing.city);
  const community = clean(listing.community);
  const street = locked ? null : clean(listing.addressLine);
  const address =
    !locked && street && city
      ? formatListingAddressOneLine({
          addressLine: street,
          unitNumber: listing.unitNumber,
          city,
          province: listing.province,
          postalCode: listing.postalCode,
        })
      : street;
  const price =
    locked || listing.listPrice == null || !Number.isFinite(listing.listPrice) || listing.listPrice <= 0
      ? null
      : formatListPrice(listing.listPrice, listing.transactionType ?? "SALE");
  const sold =
    locked || listing.soldPrice == null || !Number.isFinite(listing.soldPrice) || listing.soldPrice <= 0
      ? null
      : formatListPrice(listing.soldPrice, "SALE");
  const interior = locked ? null : formatListingSqftLabel({
    sqft: listing.sqft,
    livingAreaRange: facts?.livingAreaRange,
  });
  const lot = locked ? null : lotLabel(facts);
  const type = listing.propertyType ? propertyTypeLabel(listing.propertyType) : null;
  const rows: RoyalCollectionPropertyRow[] = [];
  const push = (label: string, value: string | null) => {
    if (value) rows.push({ label, value });
  };
  push("Address", address);
  push("City", city);
  push("Asking", price);
  push("Sold", sold);
  push("Bedrooms", locked ? null : countLabel(listing.beds));
  push("Bathrooms", locked ? null : countLabel(listing.baths));
  push("Type", type);
  push("Interior", interior);
  push("Lot", lot);
  push("MLS", clean(listing.mlsNumber));

  const description = locked ? [] : paragraphsOf(listing.description);
  const featureItems = locked
    ? []
    : [
        ["Interior", joinList(facts?.interiorFeatures)],
        ["Exterior", joinList(facts?.exteriorFeatures)],
        ["Style", joinList(facts?.architecturalStyle)],
      ].flatMap(([title, copy]) => (title && copy ? [{ title, copy }] : []));

  const roomRows = locked
    ? []
    : (listing.rooms ?? []).flatMap((room) => {
        const name = [clean(room.roomType), clean(room.roomLevel)].filter(Boolean).join(", ");
        if (!name) return [];
        return [{ label: name, value: roomMeasure(room) ?? "Measure not on file" }];
      });

  const outdoorParagraphs = locked
    ? []
    : [
        lot ? "Lot on file: " + lot + "." : null,
        community ? "The listing names " + community + "." : null,
        joinList(facts?.exteriorFeatures)
          ? "Exterior features on file: " + joinList(facts?.exteriorFeatures) + "."
          : null,
      ].filter((line): line is string => Boolean(line));

  const point = locked ? null : coordinates(listing.lat, listing.lng);
  const extraRows: RoyalCollectionPropertyRow[] = [];
  if (!locked) {
    const extraPush = (label: string, value: string | null) => {
      if (value) extraRows.push({ label, value });
    };
    extraPush("Parking", countLabel(listing.parkingSpaces));
    extraPush("Basement", joinList(facts?.basement));
    extraPush("Cooling", joinList(facts?.cooling));
    extraPush("Heat", clean(facts?.heatType));
    extraPush("Taxes", listing.taxes != null && listing.taxes > 0 ? formatListPrice(listing.taxes, "SALE") : null);
    extraPush("Listing representative", clean(facts?.listAgentFullName));
  }

  const brokerage = clean(listing.brokerageName);
  const siteName = clean(input.site.brandName) ?? "this website";
  const attribution = brokerage
    ? "Listed by " +
      brokerage +
      ". Shown on the " +
      siteName +
      " website. The website brokerage is not the listing brokerage."
    : "The listing brokerage was not supplied. " +
      siteName +
      " is the website brokerage and is not a substitute listing brokerage.";

  const photos = locked
    ? []
    : input.photos.flatMap((photo, index) => {
        const src = clean(photo.url);
        if (!src) return [];
        const label = clean(photo.label) ?? "Photograph " + (index + 1);
        return [{ src, label, alt: label }];
      });

  return {
    kind: "listing",
    kicker: type ?? "Property",
    title: address ?? city ?? "Listing",
    place: [community, city].filter(Boolean).join(" · ") || null,
    lede: locked ? "Some property details stay hidden until this account can view them." : null,
    frames: photos,
    facts: rows,
    overview:
      description.length > 0
        ? { eyebrow: "Overview", title: "About this property.", paragraphs: description }
        : null,
    highlights:
      featureItems.length > 0
        ? { eyebrow: "Highlights", title: "Recorded features.", items: featureItems }
        : null,
    rooms:
      roomRows.length > 0
        ? {
            eyebrow: "Rooms and dimensions",
            title: "Rooms on file.",
            intro: null,
            rows: roomRows,
          }
        : null,
    outdoor:
      outdoorParagraphs.length > 0
        ? {
            eyebrow: "Outdoor and neighbourhood",
            title: "Place on file.",
            paragraphs: outdoorParagraphs,
          }
        : null,
    location:
      point && city
        ? {
            eyebrow: "Location",
            title: "Recorded coordinates.",
            label: city,
            detail: point.lat.toFixed(5) + ", " + point.lng.toFixed(5),
            note: "The pin uses the coordinates supplied with this listing.",
          }
        : null,
    extras:
      extraRows.length > 0
        ? { eyebrow: "Additional details", title: "Further facts on file.", rows: extraRows }
        : null,
    related: null,
    attribution: {
      eyebrow: "Attribution",
      title: brokerage ? "Listing brokerage." : "Listing brokerage not supplied.",
      paragraphs: [attribution],
    },
    contact: contactFor(input.site),
  };
}
