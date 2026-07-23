import { prisma } from "@/lib/prisma";

export const metadata = { title: "Analytics" };

export default async function AdminAnalyticsPage() {
  const now = Date.now();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const [
    views24h,
    leads24h,
    leadsWeek,
    appointmentsWeek,
    bySource,
    newLeads,
    contactedOrBetter,
  ] = await Promise.all([
    prisma.listingView.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.lead.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.lead.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.appointment.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.lead.groupBy({
      by: ["source"],
      _count: { _all: true },
      orderBy: { _count: { source: "desc" } },
    }),
    prisma.lead.count({ where: { status: "NEW" } }),
    prisma.lead.count({
      where: {
        status: {
          in: [
            "CONTACTED",
            "QUALIFIED",
            "ACTIVE_BUYER",
            "ACTIVE_SELLER",
            "SHOWING",
            "OFFER",
            "CLIENT",
          ],
        },
      },
    }),
  ]);

  const responseRate =
    newLeads + contactedOrBetter > 0
      ? Math.round(
          (contactedOrBetter / (newLeads + contactedOrBetter)) * 100,
        )
      : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-4xl text-ink">Analytics & SLA</h1>
        <p className="mt-2 text-sm text-ink/60">
          Funnel snapshot from Houzzat events. SLA is directional until live
          first-response timestamps are instrumented.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Listing views (24h)" value={views24h} />
        <Stat label="Leads (24h)" value={leads24h} />
        <Stat label="Leads (7d)" value={leadsWeek} />
        <Stat label="Appointments (7d)" value={appointmentsWeek} />
      </div>

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Pipeline SLA (stub)</h2>
        <p className="mt-2 text-sm text-ink/65">
          Touched leads vs still-new:{" "}
          <span className="font-semibold text-canopy">{responseRate}%</span>{" "}
          progressed past NEW ({contactedOrBetter} touched · {newLeads} waiting).
        </p>
        <p className="mt-2 text-xs text-ink/45">
          Next: store first agent response timestamp on LeadActivity for true
          median first-touch SLA.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Leads by source</h2>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {bySource.map((row) => (
            <li
              key={row.source}
              className="flex justify-between px-4 py-3 text-sm"
            >
              <span>{row.source.replaceAll("_", " ")}</span>
              <span className="font-medium">{row._count._all}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="text-sm text-ink/55">{label}</p>
      <p className="mt-2 font-display text-3xl text-canopy">{value}</p>
    </div>
  );
}
