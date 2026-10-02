/**
 * Hard kill-switch for paid Google Maps Platform APIs
 * (Geocoding, Places, Routes).
 *
 * Default: OFF. No network calls to *.googleapis.com maps/places/routes
 * unless that product's own opt-in is set explicitly.
 *
 * Having GOOGLE_MAPS_API_KEY in env is NOT enough — that alone previously
 * caused large unexpected bills from bulk geocode + autocomplete.
 *
 * Routes are a separate switch. Turning on drive time must not turn
 * Geocoding or Places Text Search back on.
 */
export function isGoogleMapsBillingEnabled(): boolean {
  return process.env.GOOGLE_MAPS_BILLING_ENABLED === "1";
}

/** Catalogue pin repair. Both flags are required. The bulk job stays off. */
export function isGoogleGeocodingEnabled(): boolean {
  return (
    process.env.GOOGLE_MAPS_BILLING_ENABLED === "1" &&
    process.env.GEOCODE_USE_GOOGLE === "1" &&
    process.env.GEOCODE_SKIP_GOOGLE !== "1"
  );
}

/** Drive time only. Does not enable Geocoding, Places, or map tiles. */
export function isGoogleRoutesEnabled(): boolean {
  return (
    process.env.GOOGLE_ROUTES_ENABLED === "1" &&
    Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim())
  );
}

export function assertGoogleMapsBillingEnabled(feature: string): void {
  if (isGoogleMapsBillingEnabled()) return;
  throw new Error(
    `Google Maps billing is disabled (${feature}). ` +
      `Set GOOGLE_MAPS_BILLING_ENABLED=1 only when you intentionally accept Google Cloud charges.`,
  );
}
