/**
 * Best-effort: save geolocation as home when the signed-in customer has none yet.
 * Safe to call from client "Near me" flows; ignores failures / skips.
 */
export async function persistHomeLocationIfEmpty(input: {
  lat: number;
  lng: number;
  address?: string;
}) {
  try {
    await fetch("/api/account/home-location", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: input.lat,
        lng: input.lng,
        ...(input.address ? { address: input.address } : {}),
      }),
    });
  } catch {
    // ignore — search UX must not depend on profile write
  }
}
