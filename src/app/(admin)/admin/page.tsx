import Link from "next/link";
import { PoiSyncClient } from "@/components/admin/PoiSyncClient";
import { liveSinceDate } from "@/lib/admin/activity";
import { prisma } from "@/lib/prisma";
import { getAdminMlsPulse } from "@/lib/proptx/sync-health";

export const metadata = { title: "Admin HQ" };

function StatCard({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: number | string;
  href?: string;
  hint?: string;
}) {
  const inner = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/40">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink/45">{hint}</p> : null}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-2xl border border-line/80 bg-surface/90 p-4 shadow-[0_1px_0_rgb(20_32_28/0.03)] transition hover:border-canopy/35 sm:p-5"
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className="rounded-2xl border border-line/80 bg-surface/90 p-4 shadow-[0_1px_0_rgb(20_32_28/0.03)] sm:p-5">
      {inner}
    </div>
  );
}

function formatEventTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return date.toLocaleTimeString("en-CA", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

export default async function AdminPage() {
  const since = liveSinceDate();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const emptySync = {
    provider: "proptx" as const,
    listingCount: 0,
    message: "MLS pulse unavailable.",
  };

  const [
    sync,
    liveVisitors,
    peopleCount,
    agentsCount,
    buyersCount,
    sellersCount,
    events24h,
    leads24h,
    landingCount,
    adCount,
    recentEvents,
  ] = await Promise.all([
    getAdminMlsPulse().catch((error) => {
      console.error("[admin] MLS pulse failed", error);
      return emptySync;
    }),
    prisma.siteSession
      .count({ where: { lastSeenAt: { gte: since } } })
      .catch(() => 0),
    prisma.user.count().catch(() => 0),
    prisma.user.count({ where: { role: "AGENT" } }).catch(() => 0),
    prisma.user
      .count({ where: { isBuyer: true, role: { in: ["BUYER", "SELLER"] } } })
      .catch(() => 0),
    prisma.user.count({ where: { isSeller: true } }).catch(() => 0),
    prisma.activityEvent
      .count({ where: { createdAt: { gte: dayAgo } } })
      .catch(() => 0),
    prisma.lead.count({ where: { createdAt: { gte: dayAgo } } }).catch(() => 0),
    prisma.landingPage.count().catch(() => 0),
    prisma.adCampaign.count().catch(() => 0),
    prisma.activityEvent
      .findMany({
        where: { type: { not: "HEARTBEAT" } },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          type: true,
          path: true,
          title: true,
          mlsNumber: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
          visitor: { select: { visitorKey: true } },
        },
      })
      .catch((error) => {
        console.error("[admin] journey feed failed", error);
        return [];
      }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
          Command center
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">
          Live pulse across people, visitors, leads, and growth systems.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Online now"
          value={liveVisitors}
          href="/admin/visitors"
          hint="Active in the last 3 minutes"
        />
        <StatCard
          label="People"
          value={peopleCount}
          href="/admin/people"
          hint={`${agentsCount} agents · ${buyersCount} buyers · ${sellersCount} sellers`}
        />
        <StatCard
          label="Events (24h)"
          value={events24h}
          href="/admin/visitors"
          hint="Journey timeline activity"
        />
        <StatCard
          label="Leads (24h)"
          value={leads24h}
          href="/agent/leads"
          hint="CRM inquiries"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-line/80 bg-surface/90 p-4 sm:p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl text-ink">Live journey feed</h2>
            <Link
              href="/admin/visitors"
              className="text-xs font-semibold text-canopy hover:underline"
            >
              Open visitors →
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-line/70">
            {recentEvents.length === 0 ? (
              <li className="py-8 text-center text-sm text-ink/50">
                No tracked activity yet. Browse the public site to seed the feed.
              </li>
            ) : (
              recentEvents.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {event.type.replaceAll("_", " ")}
                      {event.mlsNumber ? ` · ${event.mlsNumber}` : ""}
                    </p>
                    <p className="truncate text-xs text-ink/45">
                      {event.user?.email ||
                        (event.visitor
                          ? `Visitor ${event.visitor.visitorKey.slice(0, 8)}…`
                          : "Anonymous")}
                      {event.path ? ` · ${event.path}` : ""}
                    </p>
                  </div>
                  <time className="shrink-0 text-xs text-ink/40">
                    {formatEventTime(event.createdAt)}
                  </time>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-line/80 bg-surface/90 p-5">
            <h2 className="font-semibold text-ink">MLS sync</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink/45">Provider</dt>
                <dd className="font-medium uppercase">{sync.provider}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink/45">Listings</dt>
                <dd className="font-medium">{sync.listingCount}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-ink/55">{sync.message}</p>
          </div>
          <StatCard label="Landings" value={landingCount} href="/admin/landings" />
          <StatCard label="Ad campaigns" value={adCount} href="/admin/ads" />
        </div>
      </div>

      <PoiSyncClient />
    </div>
  );
}
