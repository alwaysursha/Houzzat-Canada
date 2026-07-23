import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ token: string }> };

export default async function TrackedReferralPage({ params }: Params) {
  const { token } = await params;
  const handoff = await prisma.referralHandoff.findUnique({
    where: { token },
    include: {
      partner: true,
      agent: { select: { name: true, email: true } },
    },
  });
  if (!handoff) notFound();

  if (handoff.status === "SENT") {
    await prisma.referralHandoff.update({
      where: { id: handoff.id },
      data: { status: "VIEWED", viewedAt: new Date() },
    });
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-16 sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-[0.14em] text-ink/45">
        Referral handoff
      </p>
      <h1 className="font-display text-3xl text-ink">{handoff.partner.name}</h1>
      <p className="text-sm text-ink/65">
        Introduced by {handoff.agent.name ?? handoff.agent.email}
      </p>
      <dl className="space-y-2 rounded-2xl border border-line bg-surface p-5 text-sm">
        <div>
          <dt className="text-ink/45">Client</dt>
          <dd className="font-medium">
            {handoff.customerName ?? "—"}
            {handoff.customerEmail ? ` · ${handoff.customerEmail}` : ""}
          </dd>
        </div>
        {handoff.listingMls ? (
          <div>
            <dt className="text-ink/45">Listing</dt>
            <dd>
              <Link
                href={`/listing/${handoff.listingMls}`}
                className="text-canopy"
              >
                {handoff.listingMls}
              </Link>
            </dd>
          </div>
        ) : null}
        {handoff.notes ? (
          <div>
            <dt className="text-ink/45">Notes</dt>
            <dd>{handoff.notes}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-ink/45">Status</dt>
          <dd className="font-medium">
            {handoff.status === "SENT" ? "VIEWED" : handoff.status}
          </dd>
        </div>
      </dl>
      <Link
        href={`/partners/portal/${handoff.partner.portalToken}`}
        className="inline-flex rounded-lg bg-canopy px-4 py-2 text-sm font-semibold text-white"
      >
        Open partner portal
      </Link>
    </div>
  );
}
