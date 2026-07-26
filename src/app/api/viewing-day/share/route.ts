import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requireCustomerUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import {
  enrichTourStops,
  getOrCreateActiveTour,
  serializeTour,
} from "@/lib/viewing-day/server";

/** Ensure a share token exists and return public share URL payload. */
export async function POST() {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const tour = await getOrCreateActiveTour(user.id);
  if (tour.stops.length === 0) {
    return NextResponse.json(
      { error: "Add homes before sharing." },
      { status: 400 },
    );
  }

  const shareToken = tour.shareToken ?? randomBytes(12).toString("hex");
  if (!tour.shareToken) {
    await prisma.viewingTour.update({
      where: { id: tour.id },
      data: { shareToken },
    });
  }

  const refreshed = await getOrCreateActiveTour(user.id);
  const cards = await enrichTourStops(refreshed.stops.map((s) => s.mlsNumber));
  return NextResponse.json({
    shareToken: refreshed.shareToken ?? shareToken,
    path: `/viewing-day/share/${refreshed.shareToken ?? shareToken}`,
    tour: serializeTour(refreshed, cards),
  });
}
