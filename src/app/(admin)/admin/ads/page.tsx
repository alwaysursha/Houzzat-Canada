import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Ad Studio" };

export default async function AdminAdsPage() {
  const campaigns = await prisma.adCampaign.findMany({
    include: { _count: { select: { leads: true, creatives: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
            Ad Studio
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink/60">
            Brand-grade Meta + Google creative packs, tracked UTMs, and export
            kits. Live ad-account publish comes after creative quality is locked
            — export-first keeps Houzzat looking premium.
          </p>
        </div>
        <Link
          href="/admin/ads/new"
          className="inline-flex items-center justify-center rounded-xl bg-canopy px-4 py-2.5 text-sm font-semibold text-white hover:bg-canopy-deep sm:shrink-0"
        >
          New campaign
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink/55">
          No campaigns yet. Generate one from a listing, landing, area, or
          valuation funnel.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/ads/${c.id}`}
                className="flex flex-col gap-2 px-4 py-4 transition hover:bg-mist/60 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:px-5"
              >
                <div>
                  <p className="font-semibold text-ink">{c.name}</p>
                  <p className="text-sm text-ink/55">
                    {c.goal} · {c.platform} · {c.sourceType}:{c.sourceId}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-medium text-canopy">{c.status}</p>
                  <p className="text-ink/45">
                    {c._count.creatives} creatives · {c._count.leads} leads
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
