import { CmaClient } from "@/components/agent/CmaClient";
import { formatPrice } from "@/lib/listings/constants";
import { prisma } from "@/lib/prisma";
import { excludeStagingSnapshotWhere } from "@/lib/tenancy/templates/high-octane-staging-snapshot";

export const metadata = { title: "CMA drafts" };

export default async function AgentCmaPage() {
  const listings = await prisma.listing.findMany({
    where: {
      status: "ACTIVE",
      segment: { in: ["RESIDENTIAL", "COMMERCIAL"] },
      ...excludeStagingSnapshotWhere(),
    },
    orderBy: { listPrice: "asc" },
    take: 40,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-ink">One-click CMA</h1>
        <p className="mt-2 text-sm text-ink/60">
          Pull nearby comps from listing inventory and share an internal draft
          link.
        </p>
      </div>
      <CmaClient
        listings={listings.map((l) => ({
          mlsNumber: l.mlsNumber,
          label: `${l.addressLine}, ${l.city} · ${formatPrice(l.listPrice)}`,
          lat: l.lat,
          lng: l.lng,
          city: l.city,
          community: l.community,
          beds: l.beds,
          baths: l.baths,
          addressLine: l.addressLine,
        }))}
      />
    </div>
  );
}
