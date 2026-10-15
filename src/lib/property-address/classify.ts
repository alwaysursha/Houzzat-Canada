/**
 * Listing-status classification for resolved addresses.
 * NEVER map provider failure → NO_ACTIVE_LISTING_FOUND.
 */

export type AddressListingStatusClass =
  | "ACTIVE_LISTING"
  | "NO_ACTIVE_LISTING_FOUND"
  | "UNKNOWN";

export type MlsProbeOutcome =
  | { kind: "active"; mlsNumber: string; path: string }
  | { kind: "none" }
  | { kind: "failed"; reason: string }
  | { kind: "skipped"; reason: string };

export type AddressResolveConfidence = "high" | "medium" | "low";

export function classifyAddressListingStatus(
  probe: MlsProbeOutcome,
): AddressListingStatusClass {
  switch (probe.kind) {
    case "active":
      return "ACTIVE_LISTING";
    case "none":
      return "NO_ACTIVE_LISTING_FOUND";
    case "failed":
    case "skipped":
      return "UNKNOWN";
    default: {
      const _exhaustive: never = probe;
      return _exhaustive;
    }
  }
}

export function resolveConfidence(input: {
  geocodeOk: boolean;
  hasStreetNumber: boolean;
  hasCity: boolean;
  hasCoords: boolean;
  listingStatusClass: AddressListingStatusClass;
  mlsProbe: MlsProbeOutcome["kind"];
}): AddressResolveConfidence {
  if (!input.geocodeOk || !input.hasCoords) return "low";
  if (input.listingStatusClass === "UNKNOWN") {
    return input.hasStreetNumber && input.hasCity ? "medium" : "low";
  }
  if (input.hasStreetNumber && input.hasCity && input.mlsProbe === "none") {
    return "high";
  }
  if (input.listingStatusClass === "ACTIVE_LISTING") return "high";
  if (input.hasStreetNumber) return "medium";
  return "low";
}
