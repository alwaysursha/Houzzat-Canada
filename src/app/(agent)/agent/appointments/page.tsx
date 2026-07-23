import Link from "next/link";
import { redirect } from "next/navigation";
import { AppointmentActions } from "@/components/agent/AppointmentActions";
import { canManageAllLeads, requireAgentUser } from "@/lib/agent";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Appointments" };

export default async function AgentAppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const agent = await requireAgentUser();
  if (!agent) redirect("/auth/sign-in?callbackUrl=/agent/appointments");
  const params = await searchParams;

  const appointments = await prisma.appointment.findMany({
    where: {
      ...(canManageAllLeads(agent.role)
        ? {}
        : {
            OR: [{ agentId: agent.id }, { agentId: null }],
          }),
      ...(params.type === "VIRTUAL_VIEWING"
        ? { type: "VIRTUAL_VIEWING" as const }
        : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      customer: { select: { name: true, email: true, phone: true } },
      lead: { select: { id: true, source: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-ink">Appointments</h1>
        <p className="mt-2 text-sm text-ink/60">
          Confirm showings and Virtual Viewings · share video join links
        </p>
      </div>

      <ul className="space-y-4">
        {appointments.map((appt) => (
          <li
            key={appt.id}
            className="rounded-2xl border border-line bg-surface p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-ink">
                  {appt.type.replaceAll("_", " ")} · {appt.status}
                </p>
                <p className="mt-1 text-sm text-ink/60">
                  {appt.listingMls ? (
                    <Link
                      href={`/listing/${appt.listingMls}`}
                      className="text-canopy"
                    >
                      {appt.listingMls}
                    </Link>
                  ) : (
                    "No listing"
                  )}
                  {appt.customer?.email
                    ? ` · ${appt.customer.name ?? ""} <${appt.customer.email}>`
                    : ""}
                </p>
                {appt.focusNotes ? (
                  <p className="mt-1 text-sm text-ink/70">
                    Focus: {appt.focusNotes}
                  </p>
                ) : null}
                {appt.notes ? (
                  <p className="mt-1 text-sm text-ink/55">{appt.notes}</p>
                ) : null}
                {appt.lead ? (
                  <Link
                    href={`/agent/leads/${appt.lead.id}`}
                    className="mt-2 inline-block text-xs text-canopy"
                  >
                    Open lead
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="mt-3">
              <AppointmentActions
                appointmentId={appt.id}
                status={appt.status}
                type={appt.type}
                videoJoinUrl={appt.videoJoinUrl}
              />
            </div>
          </li>
        ))}
      </ul>

      {appointments.length === 0 ? (
        <p className="text-sm text-ink/50">No appointments yet.</p>
      ) : null}
    </div>
  );
}
