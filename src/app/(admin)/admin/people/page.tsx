import { redirect } from "next/navigation";
import { resolveAdminPageSurface } from "@/lib/admin/resolve-admin-page-surface";
import { loadTenantPeopleSnapshot } from "@/lib/admin/tenant-hq-deferred";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "People" };

export default async function AdminPeoplePage() {
  const surface = await resolveAdminPageSurface();
  if (surface.kind === "deny") redirect("/agent");

  if (surface.kind === "tenant") {
    const snap = await loadTenantPeopleSnapshot(surface.auth.workspaceId);
    return (
      <div className="space-y-8">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
            People
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-ink/60">
            ACTIVE WorkspaceMembers and pending invites for{" "}
            {surface.auth.brand.displayName}. Organization membership is not
            used.
          </p>
        </div>

        <section className="overflow-hidden rounded-2xl border border-line/80 bg-surface/90">
          <div className="border-b border-line/70 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Team members</h2>
          </div>
          <ul className="divide-y divide-line/60">
            {snap.members.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-ink">
                    {m.name || m.email || m.userId.slice(0, 8)}
                  </p>
                  <p className="text-xs text-ink/45">{m.email}</p>
                </div>
                <span className="rounded-full bg-canopy/12 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-canopy">
                  {m.role}
                </span>
              </li>
            ))}
            {snap.members.length === 0 ? (
              <li className="px-4 py-6 text-sm text-ink/50">No members.</li>
            ) : null}
          </ul>
        </section>

        <section className="overflow-hidden rounded-2xl border border-line/80 bg-surface/90">
          <div className="border-b border-line/70 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Pending invites</h2>
          </div>
          <ul className="divide-y divide-line/60">
            {snap.pendingInvites.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-ink">{inv.email}</p>
                  <p className="text-xs text-ink/45">
                    {inv.createdAt.toLocaleString("en-CA")}
                  </p>
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wide text-ink/50">
                  {inv.role}
                </span>
              </li>
            ))}
            {snap.pendingInvites.length === 0 ? (
              <li className="px-4 py-6 text-sm text-ink/50">
                No pending invites.
              </li>
            ) : null}
          </ul>
        </section>
      </div>
    );
  }

  // Platform surface — legacy global people directory (HouzzatPRO ops only).
  const people = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
          People
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">
          HouzzatPRO platform directory (not a tenant CRM roster).
        </p>
      </div>
      <ul className="divide-y divide-line/60 rounded-2xl border border-line/80 bg-surface/90">
        {people.map((p) => (
          <li key={p.id} className="px-4 py-3 text-sm">
            <p className="font-medium text-ink">{p.name || p.email}</p>
            <p className="text-xs text-ink/45">
              {p.role} · {p.email}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
