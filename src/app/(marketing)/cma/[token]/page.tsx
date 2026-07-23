import Link from "next/link";
import { notFound } from "next/navigation";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { formatPrice } from "@/lib/listings/constants";
import type { CmaComp } from "@/lib/market/cma";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Params) {
  const { token } = await params;
  const report = await prisma.cmaReport.findUnique({ where: { token } });
  return {
    title: report
      ? `CMA · ${report.subjectAddress ?? report.city}`
      : "CMA",
  };
}

export default async function PublicCmaPage({ params }: Params) {
  const { token } = await params;
  const report = await prisma.cmaReport.findUnique({
    where: { token },
    include: { agent: { select: { name: true, email: true } } },
  });
  if (!report) notFound();

  const comps = report.comps as unknown as CmaComp[];

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-12 sm:px-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/45">
          Comparative market draft
        </p>
        <h1 className="mt-2 font-display text-4xl text-ink">
          {report.subjectAddress ?? report.city}
        </h1>
        <p className="mt-2 text-sm text-ink/60">
          Prepared by {report.agent.name ?? report.agent.email} ·{" "}
          {report.createdAt.toLocaleDateString("en-CA")}
        </p>
      </div>

      <p className="rounded-2xl border border-line bg-surface p-5 leading-relaxed text-ink/80">
        {report.summary}
      </p>

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-ink">Comps</h2>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {comps.map((c) => (
            <li
              key={c.mlsNumber}
              className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm"
            >
              <div>
                <Link
                  href={`/listing/${c.mlsNumber}`}
                  className="font-medium text-canopy"
                >
                  {c.addressLine}
                </Link>
                <p className="text-ink/50">
                  {c.city}
                  {c.community ? ` · ${c.community}` : ""} · {c.beds}bd ·{" "}
                  {c.distanceKm.toFixed(1)} km · {c.status}
                </p>
              </div>
              <div className="text-right font-medium">
                {c.soldPrice != null
                  ? `Sold ${formatPrice(c.soldPrice)}`
                  : formatPrice(c.listPrice)}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <MlsDisclaimer />
    </div>
  );
}
