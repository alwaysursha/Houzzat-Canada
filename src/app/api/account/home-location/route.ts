import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import { reverseGeocode } from "@/lib/geo/reverse-geocode";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().trim().max(300).optional(),
});

/**
 * Persist home location for signed-in customers when homeAddress is empty.
 * Used by "Near me" / geolocation flows — never overwrites an existing home.
 */
export async function PATCH(request: Request) {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { id: user.id },
    select: { homeAddress: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.homeAddress?.trim()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      homeAddress: existing.homeAddress,
    });
  }

  let address = parsed.data.address?.trim() || null;
  if (!address) {
    address = await reverseGeocode(parsed.data.lat, parsed.data.lng);
  }
  if (!address) {
    return NextResponse.json(
      { error: "Could not resolve an address for that location." },
      { status: 422 },
    );
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      homeAddress: address,
      homeLat: parsed.data.lat,
      homeLng: parsed.data.lng,
    },
    select: { homeAddress: true, homeLat: true, homeLng: true },
  });

  return NextResponse.json({ ok: true, skipped: false, ...updated });
}
