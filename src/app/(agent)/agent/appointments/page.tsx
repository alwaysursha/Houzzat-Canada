import Link from "next/link";
import { redirect } from "next/navigation";
import { AppointmentActions } from "@/components/agent/AppointmentActions";
import { requireAgentContext } from "@/lib/agent";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Appointments · Agent CRM" };

export default async function AgentAppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const ctx = await requireAgentContext();
  if (!ctx) redirect("/auth/sign-in?callbackUrl=/agent/appointments");
  const params = await searchParams;

  const orgLeadIds = (
    await prisma.lead.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true },
    })
  ).map((l) => l.id);

  const appointments = await prisma.appointment.findMany({
    where: {
      AND: [
        ctx.canSeeTeamLeads || ctx.isPlatformAdmin
          ? {
              OR: [
                { agentId: ctx.user.id },
                { agentId: null },
                { leadId: { in: orgLeadIds } },
              ],
            }
          : {
              OR: [
                { agentId: ctx.user.id },
                { agentId: null, leadId: { in: orgLeadIds } },
              ],
            },
        params.type === "VIRTUAL_VIEWING"
          ? { type: "VIRTUAL_VIEWING" as const }
          : {},
      ],
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
          Showings, Virtual Viewings, and consults.
        </p>
      </div>

      <ul className="space-y-3">
        {appointments.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-ink/45">
            No appointments in your book.
          </li>
        ) : (
          appointments.map((a) => (
            <li
              key={a.id}
              className="rounded-2xl border border-line/80 bg-surface/90 p-4 shadow-[0_1px_0_rgb(20_32_28/0.03)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">
                    {a.type.replaceAll("_", " ")} · {a.status}
                  </p>
                  <p className="mt-1 text-sm text-ink/60">
                    {a.customer?.name || a.customer?.email || "Guest"}
                    {a.listingMls ? (
                      <>
                        {" · "}
                        <Link
                          href={`/listing/${a.listingMls}`}
                          className="text-canopy"
                        >
                          {a.listingMls}
                        </Link>
                      </>
                    ) : null}
                    {a.lead ? (
                      <>
                        {" · "}
                        <Link
                          href={`/agent/leads?lead=${a.lead.id}`}
                          className="text-canopy"
                        >
                          Lead
                        </Link>
                      </>
                    ) : null}
                  </p>
                  {a.startsAt ? (
                    <p className="mt-1 text-xs text-ink/45">
                      {a.startsAt.toLocaleString("en-CA")}
                    </p>
                  ) : null}
                </div>
                <AppointmentActions
                  appointmentId={a.id}
                  status={a.status}
                  type={a.type}
                  videoJoinUrl={a.videoJoinUrl}
                />
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
