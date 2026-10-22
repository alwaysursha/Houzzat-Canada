import { AdStudioCreateClient } from "@/components/admin/AdStudioCreateClient";
import { formatPrice } from "@/lib/listings/constants";
import { prisma } from "@/lib/prisma";
import { excludeStagingSnapshotWhere } from "@/lib/tenancy/templates/high-octane-staging-snapshot";

export const metadata = { title: "New ad campaign" };

export default async function AdminAdsNewPage() {
  const [listings, landings, areas] = await Promise.all([
    prisma.listing.findMany({
      where: {
        status: "ACTIVE",
        segment: { in: ["RESIDENTIAL", "COMMERCIAL"] },
        ...excludeStagingSnapshotWhere(),
      },
      orderBy: { listPrice: "asc" },
      take: 40,
      select: {
        mlsNumber: true,
        addressLine: true,
        city: true,
        listPrice: true,
      },
    }),
    prisma.landingPage.findMany({
      orderBy: { updatedAt: "desc" },
      select: { slug: true, title: true },
    }),
    prisma.geoPlace.findMany({
      where: { published: true },
      orderBy: { displayName: "asc" },
      take: 40,
      select: { slug: true, displayName: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-ink sm:text-4xl">New campaign</h1>
        <p className="mt-2 text-sm text-ink/60">
          Pick a source and goal — we’ll generate platform copy, image crop
          hints, and a tracked destination URL.
        </p>
      </div>
      <AdStudioCreateClient
        listings={listings.map((l) => ({
          mlsNumber: l.mlsNumber,
          label: `${l.addressLine}, ${l.city} · ${formatPrice(l.listPrice)}`,
        }))}
        landings={landings}
        areas={areas}
      />
    </div>
  );
}
