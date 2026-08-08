import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RoutePlannerClient } from "@/components/route-planner/RoutePlannerClient";
import { prisma } from "@/lib/prisma";
import { enrichTourStops, serializeTour } from "@/lib/route-planner/server";
import { noIndexMetadata } from "@/lib/seo";

type Params = { params: Promise<{ token: string }> };

export const metadata: Metadata = noIndexMetadata("Shared tour");

export default async function RoutePlannerSharePage({ params }: Params) {
  const { token } = await params;
  if (!token || token.length < 8) notFound();

  const tour = await prisma.viewingTour.findFirst({
    where: { shareToken: token },
    include: { stops: { orderBy: { sortOrder: "asc" } } },
  });
  if (!tour) notFound();

  const cards = await enrichTourStops(tour.stops.map((s) => s.mlsNumber));
  const payload = serializeTour(tour, cards);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <RoutePlannerClient readOnly shareMode initialTour={payload} />
    </div>
  );
}
