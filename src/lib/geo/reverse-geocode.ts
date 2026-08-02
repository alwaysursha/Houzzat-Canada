/**
 * Reverse-geocode lat/lng to a display address for customer home capture.
 * Prefers Google when configured; falls back to Nominatim.
 */

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  const google = await reverseGoogle(lat, lng);
  if (google) return google;
  return reverseNominatim(lat, lng);
}

async function reverseGoogle(
  lat: number,
  lng: number,
): Promise<string | null> {
  if (process.env.GOOGLE_MAPS_BILLING_ENABLED !== "1") return null;
  if (process.env.GEOCODE_SKIP_GOOGLE === "1") return null;
  const key =
    process.env.GOOGLE_MAPS_GEOCODING_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) return null;

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("latlng", `${lat},${lng}`);
    url.searchParams.set("key", key);
    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      results?: Array<{ formatted_address?: string }>;
    };
    if (data.status !== "OK" || !data.results?.length) return null;
    const address = data.results[0]?.formatted_address?.trim();
    return address || null;
  } catch {
    return null;
  }
}

async function reverseNominatim(
  lat: number,
  lng: number,
): Promise<string | null> {
  if (process.env.GEOCODE_SKIP_NOMINATIM === "1") return null;
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("addressdetails", "0");
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Houzzat/1.0 (houzzat.com; home location)",
        Accept: "application/json",
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string };
    const address = data.display_name?.trim();
    return address || null;
  } catch {
    return null;
  }
}
