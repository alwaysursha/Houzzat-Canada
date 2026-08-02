/**
 * Hard kill-switch for paid Google Maps Platform APIs
 * (Geocoding, Places, Routes).
 *
 * Default: OFF. No network calls to *.googleapis.com maps/places/routes
 * unless GOOGLE_MAPS_BILLING_ENABLED=1 is set explicitly.
 *
 * Having GOOGLE_MAPS_API_KEY in env is NOT enough — that alone previously
 * caused large unexpected bills from bulk geocode + autocomplete.
 */
export function isGoogleMapsBillingEnabled(): boolean {
  return process.env.GOOGLE_MAPS_BILLING_ENABLED === "1";
}

export function assertGoogleMapsBillingEnabled(feature: string): void {
  if (isGoogleMapsBillingEnabled()) return;
  throw new Error(
    `Google Maps billing is disabled (${feature}). ` +
      `Set GOOGLE_MAPS_BILLING_ENABLED=1 only when you intentionally accept Google Cloud charges.`,
  );
}
