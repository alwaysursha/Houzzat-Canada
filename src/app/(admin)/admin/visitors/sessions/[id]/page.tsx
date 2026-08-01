import Link from "next/link";
import { notFound } from "next/navigation";
import { JourneyTimeline } from "@/components/admin/JourneyTimeline";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Session journey · Admin HQ" };

export default async function AdminSessionJourneyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await prisma.siteSession.findUnique({
    where: { id },
    include: {
      visitor: {
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      },
      events: {
        where: { type: { not: "HEARTBEAT" } },
        orderBy: { createdAt: "desc" },
        take: 300,
      },
    },
  });

  if (!session) notFound();

  const identity =
    session.visitor.user?.email ||
    `Anonymous visitor ${session.visitor.visitorKey.slice(0, 10)}`;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/visitors"
          className="text-xs font-semibold text-canopy hover:underline"
        >
          ← Visitors
        </Link>
        <h1 className="mt-2 font-display text-4xl text-ink">Session journey</h1>
        <p className="mt-1 text-sm text-ink/55">{identity}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Pages", String(session.pageCount)],
          [
            "Started",
            session.startedAt.toLocaleString("en-CA", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }),
          ],
          [
            "Last seen",
            session.lastSeenAt.toLocaleString("en-CA", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }),
          ],
          ["Source", session.utmSource || session.landingReferrer || "Direct"],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-line/80 bg-surface p-4"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">
              {label}
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-ink">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-line/80 bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl text-ink">Full timeline</h2>
          {session.visitor.user ? (
            <Link
              href={`/admin/people/${session.visitor.user.id}`}
              className="text-xs font-semibold text-canopy hover:underline"
            >
              Open person profile →
            </Link>
          ) : null}
        </div>
        <dl className="mt-3 grid gap-2 text-xs text-ink/50 sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-ink/40">Landing</dt>
            <dd>{session.landingPath || "—"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink/40">Campaign</dt>
            <dd>
              {[session.utmSource, session.utmMedium, session.utmCampaign]
                .filter(Boolean)
                .join(" / ") || "—"}
            </dd>
          </div>
        </dl>
        <div className="mt-6">
          <JourneyTimeline events={session.events} />
        </div>
      </div>
    </div>
  );
}
