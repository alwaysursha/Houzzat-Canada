import Link from "next/link";
import { redirect } from "next/navigation";
import { IntentTimeline } from "@/components/crm/IntentTimeline";
import {
  customerWorkspaceActivityWhere,
  customerWorkspaceAppointmentWhere,
  customerWorkspaceLeadWhere,
  resolveAccountWorkspaceId,
} from "@/lib/account/customer-workspace-scope";
import { requireCustomerUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Activity" };

export default async function ActivityPage() {
  const user = await requireCustomerUser();
  if (!user) redirect("/auth/sign-in?callbackUrl=/account/activity");

  const workspaceId = await resolveAccountWorkspaceId();
  const [leads, appointments, activities] = workspaceId
    ? await Promise.all([
        prisma.lead.findMany({
          where: customerWorkspaceLeadWhere(user.id, workspaceId),
          orderBy: { createdAt: "desc" },
          take: 30,
        }),
        prisma.appointment.findMany({
          where: customerWorkspaceAppointmentWhere(user.id, workspaceId),
          orderBy: { createdAt: "desc" },
          take: 30,
        }),
        prisma.leadActivity.findMany({
          where: customerWorkspaceActivityWhere(user.id, workspaceId),
          orderBy: { createdAt: "desc" },
          take: 40,
        }),
      ])
    : [[], [], []];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-4xl text-ink">Activity</h1>
        <p className="mt-2 text-sm text-ink/60">
          Your intent timeline — inquiries, showings, and appointments.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold text-ink">Intent timeline</h2>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <IntentTimeline
            events={activities.map((a) => ({
              id: a.id,
              type: a.type,
              body: a.body,
              createdAt: a.createdAt,
            }))}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-ink">Leads / inquiries</h2>
        <ul className="space-y-2">
          {leads.map((lead) => (
            <li
              key={lead.id}
              className="rounded-xl border border-line bg-surface px-4 py-3 text-sm"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">
                  {lead.source.replaceAll("_", " ")}
                  {lead.listingMls ? (
                    <>
                      {" · "}
                      <Link
                        href={`/listing/${lead.listingMls}`}
                        className="text-canopy"
                      >
                        {lead.listingMls}
                      </Link>
                    </>
                  ) : null}
                </span>
                <span className="text-ink/45">
                  {lead.createdAt.toLocaleDateString("en-CA")} · {lead.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
        {leads.length === 0 ? (
          <p className="text-sm text-ink/50">No inquiries yet.</p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-ink">Appointments</h2>
        <ul className="space-y-2">
          {appointments.map((appt) => (
            <li
              key={appt.id}
              className="rounded-xl border border-line bg-surface px-4 py-3 text-sm"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">
                  {appt.type.replaceAll("_", " ")}
                  {appt.listingMls ? ` · ${appt.listingMls}` : ""}
                </span>
                <span className="text-ink/45">{appt.status}</span>
              </div>
            </li>
          ))}
        </ul>
        {appointments.length === 0 ? (
          <p className="text-sm text-ink/50">No appointments yet.</p>
        ) : null}
      </section>
    </div>
  );
}
