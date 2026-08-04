import Link from "next/link";
import { notFound } from "next/navigation";
import { JourneyTimeline } from "@/components/admin/JourneyTimeline";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Person · Admin HQ" };

export default async function AdminPersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      isBuyer: true,
      isSeller: true,
      disabledAt: true,
      createdAt: true,
      vowAcceptedAt: true,
      agentProfile: { select: { active: true, markets: true, phone: true } },
      _count: {
        select: {
          leads: true,
          savedListings: true,
          listingViews: true,
          appointments: true,
        },
      },
    },
  });

  if (!user) notFound();

  const events = await prisma.activityEvent.findMany({
    where: {
      OR: [{ userId: id }, { visitor: { userId: id } }],
      type: { not: "HEARTBEAT" },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/people"
          className="text-xs font-semibold text-canopy hover:underline"
        >
          ← People
        </Link>
        <h1 className="mt-2 font-display text-3xl tracking-tight text-ink sm:text-4xl">
          {user.name || user.email}
        </h1>
        <p className="mt-1 text-sm text-ink/55">{user.email}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Role", user.role],
          ["Leads", String(user._count.leads)],
          ["Saved homes", String(user._count.savedListings)],
          ["Listing views", String(user._count.listingViews)],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-line/80 bg-surface p-4"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink/40">
              {label}
            </p>
            <p className="mt-1 font-display text-2xl text-ink">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-line/80 bg-surface p-5">
          <h2 className="font-display text-xl text-ink">Profile</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink/45">Phone</dt>
              <dd>{user.phone || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink/45">Buyer tools</dt>
              <dd>{user.isBuyer ? "Yes" : "No"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink/45">Seller tools</dt>
              <dd>{user.isSeller ? "Yes" : "No"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink/45">VOW</dt>
              <dd>
                {user.vowAcceptedAt
                  ? user.vowAcceptedAt.toLocaleDateString("en-CA")
                  : "Not accepted"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink/45">Joined</dt>
              <dd>{user.createdAt.toLocaleDateString("en-CA")}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink/45">Status</dt>
              <dd className={user.disabledAt ? "text-danger" : "text-canopy"}>
                {user.disabledAt ? "Suspended" : "Active"}
              </dd>
            </div>
            {user.agentProfile ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink/45">Agent markets</dt>
                <dd className="text-right">
                  {user.agentProfile.markets.join(", ") || "—"}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="rounded-2xl border border-line/80 bg-surface p-5">
          <h2 className="font-display text-xl text-ink">Full journey</h2>
          <p className="mt-1 text-sm text-ink/50">
            Every tracked action for this person across sessions.
          </p>
          <div className="mt-5">
            <JourneyTimeline events={events} />
          </div>
        </div>
      </div>
    </div>
  );
}
