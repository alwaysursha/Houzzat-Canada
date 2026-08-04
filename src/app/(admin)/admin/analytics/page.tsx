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
    journey24h,
    journeyWeek,
    listingViewsJourney,
    searchesJourney,
    byEventType,
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
    prisma.lead.count({ where: { status: "NEW_LEAD" } }),
    prisma.lead.count({
      where: {
        status: {
          in: [
            "ATTEMPTED_CONTACT",
            "CONTACTED",
            "APPT_SET",
            "APPT_MET",
            "ACTIVE_CLIENT",
            "PENDING_CLIENT",
          ],
        },
      },
    }),
    prisma.activityEvent.count({
      where: { createdAt: { gte: dayAgo }, type: { not: "HEARTBEAT" } },
    }),
    prisma.activityEvent.count({
      where: { createdAt: { gte: weekAgo }, type: { not: "HEARTBEAT" } },
    }),
    prisma.activityEvent.count({
      where: { createdAt: { gte: dayAgo }, type: "LISTING_VIEW" },
    }),
    prisma.activityEvent.count({
      where: { createdAt: { gte: dayAgo }, type: "SEARCH" },
    }),
    prisma.activityEvent.groupBy({
      by: ["type"],
      where: { createdAt: { gte: weekAgo }, type: { not: "HEARTBEAT" } },
      _count: { _all: true },
      orderBy: { _count: { type: "desc" } },
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
        <h1 className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
          Analytics
        </h1>
        <p className="mt-2 text-sm text-ink/60">
          Funnel + journey telemetry. SLA remains directional until first-touch
          timestamps are stored on every lead.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Journey events (24h)" value={journey24h} />
        <Stat label="Listing views (24h)" value={listingViewsJourney || views24h} />
        <Stat label="Searches (24h)" value={searchesJourney} />
        <Stat label="Leads (24h)" value={leads24h} />
        <Stat label="Journey events (7d)" value={journeyWeek} />
        <Stat label="Leads (7d)" value={leadsWeek} />
        <Stat label="Appointments (7d)" value={appointmentsWeek} />
        <Stat label="Saved listing views (legacy)" value={views24h} />
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

      <div className="grid gap-6 lg:grid-cols-2">
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
            {bySource.length === 0 ? (
              <li className="px-4 py-6 text-sm text-ink/50">No leads yet.</li>
            ) : null}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">Journey events (7d)</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {byEventType.map((row) => (
              <li
                key={row.type}
                className="flex justify-between px-4 py-3 text-sm"
              >
                <span>{row.type.replaceAll("_", " ")}</span>
                <span className="font-medium">{row._count._all}</span>
              </li>
            ))}
            {byEventType.length === 0 ? (
              <li className="px-4 py-6 text-sm text-ink/50">
                No journey events yet — browse the public site to seed data.
              </li>
            ) : null}
          </ul>
        </section>
      </div>
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
