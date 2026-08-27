import { redirect } from "next/navigation";
import { resolveAdminPageSurface } from "@/lib/admin/resolve-admin-page-surface";
import { loadTenantAnalyticsSnapshot } from "@/lib/admin/tenant-hq-deferred";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Analytics" };

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-line/80 bg-surface/90 p-4 sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/40">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink/45">{hint}</p> : null}
    </div>
  );
}

export default async function AdminAnalyticsPage() {
  const surface = await resolveAdminPageSurface();
  if (surface.kind === "deny") redirect("/agent");

  if (surface.kind === "tenant") {
    const snap = await loadTenantAnalyticsSnapshot(surface.auth.workspaceId);
    return (
      <div className="space-y-8">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
            Analytics
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink/60">
            Workspace CRM metrics for {surface.auth.brand.displayName} only.
            Site-wide journey events without workspace ownership are omitted.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Leads (24h)" value={snap.leads24h} />
          <Metric label="Leads (7d)" value={snap.leadsWeek} />
          <Metric label="Appointments (7d)" value={snap.appointmentsWeek} />
          <Metric
            label="Response rate"
            value={`${snap.responseRate}%`}
            hint="Contacted+ vs new"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-line/80 bg-surface/90 p-4 sm:p-5">
            <h2 className="font-display text-lg text-ink">By source</h2>
            <ul className="mt-4 space-y-2">
              {snap.bySource.map((row) => (
                <li
                  key={row.source}
                  className="flex justify-between text-sm text-ink/70"
                >
                  <span>{row.source.replace(/_/g, " ")}</span>
                  <span className="font-semibold text-canopy">{row.count}</span>
                </li>
              ))}
              {snap.bySource.length === 0 ? (
                <li className="text-sm text-ink/50">No data.</li>
              ) : null}
            </ul>
          </section>
          <section className="rounded-2xl border border-line/80 bg-surface/90 p-4 sm:p-5">
            <h2 className="font-display text-lg text-ink">By status</h2>
            <ul className="mt-4 space-y-2">
              {snap.byStatus.map((row) => (
                <li
                  key={row.status}
                  className="flex justify-between text-sm text-ink/70"
                >
                  <span>{row.status.replace(/_/g, " ")}</span>
                  <span className="font-semibold text-canopy">{row.count}</span>
                </li>
              ))}
              {snap.byStatus.length === 0 ? (
                <li className="text-sm text-ink/50">No data.</li>
              ) : null}
            </ul>
          </section>
        </div>
      </div>
    );
  }

  // Platform surface — legacy global analytics.
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [leads24h, leadsWeek] = await Promise.all([
    prisma.lead.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.lead.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
          Analytics
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">
          HouzzatPRO platform aggregate view.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Metric label="Leads (24h)" value={leads24h} />
        <Metric label="Leads (7d)" value={leadsWeek} />
      </div>
    </div>
  );
}
