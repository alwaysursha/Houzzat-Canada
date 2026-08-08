import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HandoffActions } from "@/components/partners/HandoffActions";
import { prisma } from "@/lib/prisma";
import { noIndexMetadata } from "@/lib/seo";

type Params = { params: Promise<{ portalToken: string }> };

export const metadata: Metadata = noIndexMetadata("Partner portal");

export default async function PartnerPortalPage({ params }: Params) {
  const { portalToken } = await params;
  const partner = await prisma.referralPartner.findUnique({
    where: { portalToken },
  });
  if (!partner || !partner.active) notFound();

  const handoffs = await prisma.referralHandoff.findMany({
    where: { partnerId: partner.id },
    include: { agent: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-12 sm:px-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/45">
          Partner portal · {partner.type}
        </p>
        <h1 className="mt-2 font-display text-4xl text-ink">{partner.name}</h1>
        <p className="mt-2 text-sm text-ink/60">
          {partner.company ?? partner.email}
        </p>
      </div>

      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {handoffs.map((h) => (
          <li key={h.id} className="space-y-3 px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-ink">
                  {h.customerName ?? "Client"}
                  {h.customerEmail ? ` · ${h.customerEmail}` : ""}
                </p>
                <p className="text-sm text-ink/55">
                  From {h.agent.name ?? h.agent.email}
                  {h.listingMls ? (
                    <>
                      {" · "}
                      <Link
                        href={`/listing/${h.listingMls}`}
                        className="text-canopy"
                      >
                        {h.listingMls}
                      </Link>
                    </>
                  ) : null}
                </p>
                {h.notes ? (
                  <p className="mt-1 text-sm text-ink/70">{h.notes}</p>
                ) : null}
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide text-ink/45">
                {h.status}
              </span>
            </div>
            <HandoffActions token={h.token} status={h.status} />
          </li>
        ))}
        {handoffs.length === 0 ? (
          <li className="px-5 py-8 text-center text-sm text-ink/50">
            No handoffs yet.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
