import { notFound } from "next/navigation";
import { ViewingDayClient } from "@/components/viewing-day/ViewingDayClient";
import { prisma } from "@/lib/prisma";
import { enrichTourStops, serializeTour } from "@/lib/viewing-day/server";

type Params = { params: Promise<{ token: string }> };

export default async function ViewingDaySharePage({ params }: Params) {
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
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <ViewingDayClient readOnly shareMode initialTour={payload} />
    </div>
  );
}
