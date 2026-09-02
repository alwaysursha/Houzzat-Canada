import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { buildCmaPresentationDto } from "@/lib/cma/presentation";
import { parseSubjectSnapshot } from "@/lib/cma/schema";
import { formatPrice } from "@/lib/listings/constants";
import { listingPath } from "@/lib/listings/listing-path";
import type { CmaComp } from "@/lib/market/cma";
import { prisma } from "@/lib/prisma";
import { noIndexMetadata } from "@/lib/seo";
import { resolveWorkspaceBrand } from "@/lib/tenancy/resolve-workspace-brand";
import { buildLegacyHouzzatBrand } from "@/lib/tenancy/legacy-houzzat-brand";

type Params = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { token } = await params;
  const report = await prisma.cmaReport.findUnique({ where: { token } });
  return noIndexMetadata(
    report ? `CMA · ${report.subjectAddress ?? report.city}` : "CMA",
  );
}

export default async function PublicCmaPage({ params }: Params) {
  const { token } = await params;
  const report = await prisma.cmaReport.findUnique({
    where: { token },
    include: {
      agent: {
        select: {
          name: true,
          email: true,
          agentProfile: { select: { phone: true } },
        },
      },
      lead: {
        select: {
          customer: { select: { name: true } },
        },
      },
    },
  });
  if (!report || report.revokedAt) notFound();

  const brand = report.workspaceId
    ? await resolveWorkspaceBrand(report.workspaceId)
    : buildLegacyHouzzatBrand("legacy-public-cma");

  const presentation = buildCmaPresentationDto({
    report,
    brand,
    agent: {
      name: report.agent.name,
      email: report.agent.email,
      phone: report.agent.agentProfile?.phone ?? null,
    },
    preparedForName: report.lead?.customer?.name ?? null,
  });

  const subjectSnap = parseSubjectSnapshot(report.subjectSnapshot);
  const legacyComps = report.comps as unknown as CmaComp[];

  const primary = presentation.brand.primaryColor;
  const displayBrand = presentation.brand.displayName;
  const agentLabel = presentation.agent.name;

  const soldRows =
    presentation.soldComps.length > 0
      ? presentation.soldComps.map((c) => ({
          key: c.mlsNumber,
          addressLine: c.addressLine,
          city: c.city,
          community: c.community,
          beds: c.beds,
          distanceKm: c.distanceKm,
          status: "SOLD",
          soldPrice: c.soldPrice,
          listPrice: c.listPrice,
          mlsNumber: c.mlsNumber,
          unitNumber: c.unitNumber,
          agentSelected: c.source === "AGENT",
        }))
      : legacyComps
          .filter((c) => c.status === "SOLD")
          .map((c) => ({
            key: c.mlsNumber,
            addressLine: c.addressLine,
            city: c.city,
            community: c.community,
            beds: c.beds,
            distanceKm: c.distanceKm,
            status: c.status,
            soldPrice: c.soldPrice,
            listPrice: c.listPrice,
            mlsNumber: c.mlsNumber,
            unitNumber: c.unitNumber,
            agentSelected: false,
          }));

  const analysis = presentation.analysis;

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-12 sm:px-6">
      <div>
        <p
          className="text-sm font-semibold uppercase tracking-[0.14em]"
          style={{ color: primary }}
        >
          {displayBrand}
        </p>
        <h1 className="mt-2 font-display text-4xl text-ink">
          {report.subjectAddress ?? report.city}
        </h1>
        <p className="mt-2 text-sm text-ink/60">
          Prepared by {agentLabel}
          {presentation.agent.phone ? ` · ${presentation.agent.phone}` : ""} ·{" "}
          {presentation.preparedAt}
        </p>
        {presentation.brand.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={presentation.brand.logoUrl}
            alt={displayBrand}
            className="mt-4 h-10 w-auto object-contain"
          />
        ) : null}
      </div>

      <p className="rounded-2xl border border-line bg-surface p-5 leading-relaxed text-ink/80">
        {presentation.recommendation.summary}
      </p>

      {analysis ? (
        <section className="space-y-3 rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-2xl text-ink">Market analysis</h2>
          <p className="text-sm text-ink/70">
            Confidence: <strong>{analysis.confidence}</strong>
            {analysis.confidenceReasons.length
              ? ` — ${analysis.confidenceReasons.join("; ")}`
              : ""}
          </p>
          {analysis.medianSoldPrice != null ? (
            <p className="text-sm text-ink/80">
              Median sold: {formatPrice(analysis.medianSoldPrice)}
              {analysis.observedSoldLow != null &&
              analysis.observedSoldHigh != null
                ? ` · Observed range ${formatPrice(analysis.observedSoldLow)} – ${formatPrice(analysis.observedSoldHigh)}`
                : ""}
            </p>
          ) : null}
          {analysis.indicatedLow != null && analysis.indicatedHigh != null ? (
            <p className="text-sm text-ink/80">
              Indicated range: {formatPrice(analysis.indicatedLow)} –{" "}
              {formatPrice(analysis.indicatedHigh)}
            </p>
          ) : null}
          <p className="text-sm text-ink/65">{analysis.marketContext}</p>
          {analysis.limitedInventory ? (
            <p className="text-sm font-medium text-amber-800">
              Limited comparable inventory — search was expanded.
            </p>
          ) : null}
        </section>
      ) : null}

      {presentation.recommendation.listPrice != null ? (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-xl text-ink">
            Agent recommended list price
          </h2>
          <p className="mt-2 text-2xl font-semibold" style={{ color: primary }}>
            {formatPrice(presentation.recommendation.listPrice)}
          </p>
          {presentation.recommendation.note ? (
            <p className="mt-2 text-sm text-ink/70">
              {presentation.recommendation.note}
            </p>
          ) : null}
        </section>
      ) : null}

      {presentation.recommendation.narrative ? (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-xl text-ink">Notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
            {presentation.recommendation.narrative}
          </p>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-ink">Sold comparables</h2>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {soldRows.map((c) => (
            <li
              key={c.key}
              className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm"
            >
              <div>
                <Link
                  href={listingPath({
                    mlsNumber: c.mlsNumber,
                    addressLine: c.addressLine,
                    unitNumber: c.unitNumber,
                    city: c.city,
                  })}
                  className="font-medium text-canopy"
                >
                  {c.addressLine}
                </Link>
                <p className="text-ink/50">
                  {c.city}
                  {c.community ? ` · ${c.community}` : ""} · {c.beds} bd ·{" "}
                  {c.distanceKm.toFixed(1)} km · {c.status}
                  {c.agentSelected ? " · Agent selected" : ""}
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

      {presentation.competitionComps.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display text-2xl text-ink">
            Current market competition
          </h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {presentation.competitionComps.map((c) => (
              <li
                key={c.mlsNumber}
                className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-ink">{c.addressLine}</p>
                  <p className="text-ink/50">
                    {c.city} · {c.role} · {c.distanceKm.toFixed(1)} km
                  </p>
                </div>
                <div className="text-right font-medium">
                  {formatPrice(c.listPrice)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {subjectSnap ? (
        <p className="text-xs text-ink/45">
          Subject snapshot captured at analysis time
          {subjectSnap.propertyType ? ` · ${subjectSnap.propertyType}` : ""}.
        </p>
      ) : null}

      <p className="text-xs text-ink/45">
        {presentation.disclaimer} · {presentation.platformCredit}
      </p>

      <MlsDisclaimer />
    </div>
  );
}
