import Link from "next/link";
import { PoiSyncClient } from "@/components/admin/PoiSyncClient";
import { getListingProvider } from "@/lib/listings/provider";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const sync = await getListingProvider().syncStatus();
  const [landingCount, preconCount, valuationLeads, poiCount, areaCount, adCount] =
    await Promise.all([
      prisma.landingPage.count(),
      prisma.listing.count({ where: { segment: "PRE_CONSTRUCTION" } }),
      prisma.lead.count({ where: { source: "HOME_VALUATION" } }),
      prisma.poi.count(),
      prisma.geoPlace.count({ where: { published: true } }),
      prisma.adCampaign.count(),
    ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-4xl text-ink">Admin control</h1>
        <p className="mt-2 text-sm text-ink/60">
          Ops, landings, pre-construction, and area intel.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface p-5 md:col-span-2">
          <h2 className="font-semibold text-ink">MLS sync health</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink/45">Provider</dt>
              <dd className="font-medium uppercase">{sync.provider}</dd>
            </div>
            <div>
              <dt className="text-ink/45">Listings</dt>
              <dd className="font-medium">{sync.listingCount}</dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-ink/60">{sync.message}</p>
        </div>
        <Link
          href="/admin/landings"
          className="rounded-2xl border border-line bg-surface p-5 transition hover:border-canopy/40"
        >
          <h2 className="font-semibold">Landing pages</h2>
          <p className="mt-2 font-display text-3xl text-canopy">{landingCount}</p>
        </Link>
        <Link
          href="/admin/pre-construction"
          className="rounded-2xl border border-line bg-surface p-5 transition hover:border-canopy/40"
        >
          <h2 className="font-semibold">Pre-construction</h2>
          <p className="mt-2 font-display text-3xl text-canopy">{preconCount}</p>
        </Link>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-semibold">Valuation leads</h2>
          <p className="mt-2 font-display text-3xl text-canopy">{valuationLeads}</p>
        </div>
        <Link
          href="/admin/ads"
          className="rounded-2xl border border-line bg-surface p-5 transition hover:border-canopy/40"
        >
          <h2 className="font-semibold">Ad Studio</h2>
          <p className="mt-2 font-display text-3xl text-canopy">{adCount}</p>
        </Link>
        <Link
          href="/areas"
          className="rounded-2xl border border-line bg-surface p-5 transition hover:border-canopy/40"
        >
          <h2 className="font-semibold">Published areas</h2>
          <p className="mt-2 font-display text-3xl text-canopy">{areaCount}</p>
        </Link>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-semibold">POIs</h2>
          <p className="mt-2 font-display text-3xl text-canopy">{poiCount}</p>
        </div>
      </div>

      <PoiSyncClient />
    </div>
  );
}
