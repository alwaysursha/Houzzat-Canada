import { redirect } from "next/navigation";
import { resolveAdminPageSurface } from "@/lib/admin/resolve-admin-page-surface";
import { loadSharedMlsCorpusPulse } from "@/lib/admin/tenant-hq-deferred";
import { AdminDeferredMlsSync } from "@/components/admin/AdminHqDeferredSections";

export const metadata = { title: "MLS Sync" };

/**
 * SHARED listing corpus pulse for tenants.
 * Aggregate inventory stats only — never credentials or private feed config.
 */
export default async function AdminMlsPage() {
  const surface = await resolveAdminPageSurface();
  if (surface.kind === "deny") redirect("/agent");

  if (surface.kind === "tenant") {
    const pulse = await loadSharedMlsCorpusPulse();
    return (
      <div className="space-y-8">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
            MLS Sync
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink/60">
            Shared listing corpus statistics for {surface.auth.brand.displayName}.
            Inventory is platform infrastructure — not duplicated per tenant.
            Private MLS credentials and feed configuration are never shown here.
          </p>
        </div>

        <div className="rounded-2xl border border-line/80 bg-surface/90 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink/40">
            Shared corpus
          </p>
          <p className="mt-2 font-display text-3xl text-ink">
            {"listingCount" in pulse ? pulse.listingCount : "—"}
          </p>
          <p className="mt-2 text-sm text-ink/55">
            {"message" in pulse ? String(pulse.message) : "MLS pulse"}
          </p>
          <p className="mt-4 text-xs text-ink/45">
            Provider:{" "}
            {"provider" in pulse ? String(pulse.provider) : "proptx"} · Tenant
            private keys / IDX agreements are isolated and not exposed on this
            page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
          MLS Sync
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">
          HouzzatPRO platform MLS operations.
        </p>
      </div>
      <AdminDeferredMlsSync />
    </div>
  );
}
