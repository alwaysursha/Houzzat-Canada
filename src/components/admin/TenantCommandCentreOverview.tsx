import Link from "next/link";
import type { TenantCommandCentreStats } from "@/lib/admin/tenant-hq-deferred";

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

export function TenantCommandCentreOverview({
  displayName,
  stats,
}: {
  displayName: string;
  stats: TenantCommandCentreStats;
}) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
          {displayName} Command Centre
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">
          Full workspace management for {displayName} — leads, routing, team,
          analytics, and CRM. Isolated from every other tenant.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Leads (24h)"
          value={stats.leads24h}
          href="/agent/leads"
          hint="New inquiries in this workspace"
        />
        <StatCard
          label="Open leads"
          value={stats.openLeads}
          href="/agent/leads"
          hint={`${stats.buyerLeads} buyer · ${stats.sellerLeads} seller`}
        />
        <StatCard
          label="Open tasks"
          value={stats.openTasks}
          href="/agent/tasks"
          hint="Agent tasks"
        />
        <StatCard
          label="Upcoming appointments"
          value={stats.upcomingAppointments}
          href="/agent/appointments"
          hint="Requested / confirmed"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
        <StatCard
          label="Team members"
          value={stats.teamMembers}
          href="/admin/people"
          hint={`${stats.agentMembers} agents`}
        />
        <StatCard label="Lead routing" value="Configure" href="/admin/lead-routing" />
        <StatCard label="Analytics" value="Open" href="/admin/analytics" />
        <StatCard label="MLS corpus" value="Pulse" href="/admin/mls" hint="Shared inventory stats" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-line/80 bg-surface/90 p-4 sm:p-5">
          <h2 className="font-display text-lg text-ink">Status breakdown</h2>
          {stats.byStatus.length === 0 ? (
            <p className="mt-4 text-sm text-ink/50">No leads yet.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {stats.byStatus.map((row) => (
                <li
                  key={row.status}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-ink/70">{row.status.replace(/_/g, " ")}</span>
                  <span className="font-semibold text-canopy">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-2xl border border-line/80 bg-surface/90 p-4 sm:p-5">
          <h2 className="font-display text-lg text-ink">Lead sources</h2>
          {stats.bySource.length === 0 ? (
            <p className="mt-4 text-sm text-ink/50">No source data yet.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {stats.bySource.map((row) => (
                <li
                  key={row.source}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-ink/70">{row.source.replace(/_/g, " ")}</span>
                  <span className="font-semibold text-canopy">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-line/80 bg-surface/90 p-4 sm:p-5">
        <h2 className="font-display text-lg text-ink">Recent CRM activity</h2>
        <p className="mt-1 text-xs text-ink/45">
          Lead activity in this workspace only.
        </p>
        {stats.recentLeadActivity.length === 0 ? (
          <p className="mt-6 text-sm text-ink/50">
            No recent activity for {displayName} yet.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line/60">
            {stats.recentLeadActivity.map((row) => (
              <li key={row.id} className="py-3">
                <Link
                  href={`/agent/leads/${row.leadId}`}
                  className="block transition hover:text-canopy"
                >
                  <p className="text-sm font-medium text-ink">
                    {row.type.replace(/_/g, " ")}
                  </p>
                  {row.body ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-ink/50">
                      {row.body}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-ink/35">
                    {row.createdAt.toLocaleString("en-CA")}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="rounded-2xl border border-dashed border-canopy/35 bg-canopy/5 p-4 sm:p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-canopy">
          Powered by HouzzatPRO
        </p>
        <p className="mt-2 text-sm text-ink/60">
          {displayName} is an independent workspace. Platform administration
          lives on houzzatpro.com — not in this Command Centre.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/agent"
            className="inline-flex rounded-xl bg-canopy px-3 py-2 text-xs font-bold uppercase tracking-wide text-white"
          >
            Open CRM
          </Link>
          <Link
            href="/agent/team"
            className="inline-flex rounded-xl border border-canopy/40 px-3 py-2 text-xs font-bold uppercase tracking-wide text-canopy"
          >
            Team roster
          </Link>
        </div>
      </div>
    </div>
  );
}
