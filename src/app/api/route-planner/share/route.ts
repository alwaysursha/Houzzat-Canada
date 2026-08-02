import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requireFullCustomerUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import {
  enrichTourStops,
  getOrCreateActiveTour,
  serializeTour,
} from "@/lib/route-planner/server";

/** Ensure a share token exists and return public share URL payload. */
export async function POST() {
  const access = await requireFullCustomerUser();
  if (access.denied) return access.denied;
  const user = access.user;

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
    path: `/route-planner/share/${refreshed.shareToken ?? shareToken}`,
    tour: serializeTour(refreshed, cards),
  });
}
