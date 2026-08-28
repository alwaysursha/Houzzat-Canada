import Link from "next/link";
import {
  AdminDeferredJourneyFeed,
  AdminDeferredMlsSync,
  AdminDeferredSecondarySidebar,
} from "@/components/admin/AdminHqDeferredSections";
import { TenantCommandCentreOverview } from "@/components/admin/TenantCommandCentreOverview";
import { PoiSyncClient } from "@/components/admin/PoiSyncClient";
import { loadAdminCriticalStats } from "@/lib/admin/hq-deferred";
import { loadTenantCommandCentreStats } from "@/lib/admin/tenant-hq-deferred";
import { resolveAdminPageSurface } from "@/lib/admin/resolve-admin-page-surface";
import { PLATFORM_PRODUCT_NAME } from "@/lib/constants";

export const metadata = { title: "Command Centre" };

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

export default async function AdminPage() {
  const surface = await resolveAdminPageSurface();
  if (surface.kind === "deny") {
    return null;
  }

  if (surface.kind === "tenant") {
    const stats = await loadTenantCommandCentreStats(surface.auth.workspaceId);
    return (
      <TenantCommandCentreOverview
        displayName={surface.auth.brand.displayName}
        stats={stats}
      />
    );
  }

  // Platform surface
  // Critical path: first-row stats only. Feed / MLS / landings stream after paint.
  const {
    liveVisitors,
    peopleCount,
    agentsCount,
    buyersCount,
    sellersCount,
    events24h,
    leads24h,
  } = await loadAdminCriticalStats();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
          Command centre
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">
          Live pulse across people, visitors, leads, and growth systems on{" "}
          {PLATFORM_PRODUCT_NAME}.
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
        <AdminDeferredJourneyFeed />
        <AdminDeferredSecondarySidebar />
      </div>

      <PoiSyncClient />

      <AdminDeferredMlsSync />
    </div>
  );
}
