import Link from "next/link";
import { JourneyTimeline } from "@/components/admin/JourneyTimeline";
import { VisitorsLiveClient } from "@/components/admin/VisitorsLiveClient";
import { liveSinceDate } from "@/lib/admin/activity";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Visitors · Admin HQ" };

export default async function AdminVisitorsPage() {
  const since = liveSinceDate();

  const [liveSessions, recentSessions, recentEvents] = await Promise.all([
    prisma.siteSession.findMany({
      where: { lastSeenAt: { gte: since } },
      orderBy: { lastSeenAt: "desc" },
      take: 80,
      include: {
        visitor: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
        events: {
          where: { type: { not: "HEARTBEAT" } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
    prisma.siteSession.findMany({
      orderBy: { lastSeenAt: "desc" },
      take: 40,
      include: {
        visitor: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    }),
    prisma.activityEvent.findMany({
      where: { type: { not: "HEARTBEAT" } },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl text-ink">Visitors</h1>
          <p className="mt-2 text-sm text-ink/60">
            Who’s online now, plus the full site journey timeline.
          </p>
        </div>
        <VisitorsLiveClient />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl text-ink">
            Online now{" "}
            <span className="text-canopy">({liveSessions.length})</span>
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-canopy/10 px-2.5 py-1 text-[11px] font-semibold text-canopy">
            <span className="size-1.5 animate-pulse rounded-full bg-canopy" />
            Live
          </span>
        </div>

        {liveSessions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-surface px-4 py-10 text-center text-sm text-ink/50">
            Nobody online in the last 3 minutes. Open the public site in another
            tab to see yourself appear.
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {liveSessions.map((s) => {
              const last = s.events[0];
              const identity =
                s.visitor.user?.email ||
                `Anon ${s.visitor.visitorKey.slice(0, 8)}`;
              return (
                <li key={s.id}>
                  <Link
                    href={`/admin/visitors/sessions/${s.id}`}
                    className="block rounded-2xl border border-line/80 bg-surface p-4 transition hover:border-canopy/35"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">
                          {s.visitor.user?.name || identity}
                        </p>
                        <p className="truncate text-xs text-ink/45">
                          {identity}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] font-semibold text-canopy">
                        {s.pageCount} pages
                      </span>
                    </div>
                    <p className="mt-3 truncate text-sm text-ink/70">
                      {last?.path || s.landingPath || "Browsing"}
                    </p>
                    <p className="mt-1 text-[11px] text-ink/40">
                      Last seen{" "}
                      {s.lastSeenAt.toLocaleTimeString("en-CA", {
                        hour: "numeric",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                      {s.utmSource ? ` · ${s.utmSource}` : ""}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-line/80 bg-surface p-5">
          <h2 className="font-display text-xl text-ink">Recent sessions</h2>
          <ul className="mt-4 divide-y divide-line/70">
            {recentSessions.map((s) => (
              <li key={s.id} className="py-3">
                <Link
                  href={`/admin/visitors/sessions/${s.id}`}
                  className="block transition hover:text-canopy"
                >
                  <p className="text-sm font-semibold">
                    {s.visitor.user?.email ||
                      `Visitor ${s.visitor.visitorKey.slice(0, 8)}…`}
                  </p>
                  <p className="text-xs text-ink/45">
                    {s.pageCount} pages ·{" "}
                    {s.lastSeenAt.toLocaleString("en-CA", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {s.landingPath ? ` · ${s.landingPath}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-line/80 bg-surface p-5">
          <h2 className="font-display text-xl text-ink">Site journey feed</h2>
          <p className="mt-1 text-sm text-ink/50">
            Latest events across all visitors.
          </p>
          <div className="mt-5 max-h-[36rem] overflow-y-auto pr-1">
            <JourneyTimeline events={recentEvents} />
          </div>
        </section>
      </div>
    </div>
  );
}
