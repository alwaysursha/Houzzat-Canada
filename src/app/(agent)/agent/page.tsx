import Link from "next/link";
import { redirect } from "next/navigation";
import { canManageAllLeads, requireAgentUser } from "@/lib/agent";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Agent desk" };

export default async function AgentPage() {
  const agent = await requireAgentUser();
  if (!agent) redirect("/auth/sign-in?callbackUrl=/agent");

  const scope = canManageAllLeads(agent.role)
    ? {}
    : {
        OR: [{ assignedAgentId: agent.id }, { assignedAgentId: null }],
      };

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const [newLeads, todayAppts, virtualPending, unassigned] = await Promise.all([
    prisma.lead.count({
      where: { status: "NEW", ...scope },
    }),
    prisma.appointment.count({
      where: {
        status: { in: ["REQUESTED", "CONFIRMED"] },
        ...(canManageAllLeads(agent.role) ? {} : { agentId: agent.id }),
        OR: [
          { startsAt: { gte: startOfDay, lte: endOfDay } },
          { startsAt: null, createdAt: { gte: startOfDay } },
        ],
      },
    }),
    prisma.appointment.count({
      where: {
        type: "VIRTUAL_VIEWING",
        status: { in: ["REQUESTED", "CONFIRMED"] },
        ...(canManageAllLeads(agent.role) ? {} : { agentId: agent.id }),
      },
    }),
    prisma.lead.count({ where: { assignedAgentId: null, status: "NEW" } }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-4xl text-ink">Agent desk</h1>
        <p className="mt-2 text-sm text-ink/60">
          Pipeline, showings, and Virtual Viewings.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "New leads", value: newLeads, href: "/agent/leads" },
          {
            label: "Today’s appointments",
            value: todayAppts,
            href: "/agent/appointments",
          },
          {
            label: "Virtual Viewings open",
            value: virtualPending,
            href: "/agent/appointments?type=VIRTUAL_VIEWING",
          },
          {
            label: "Unassigned",
            value: unassigned,
            href: "/agent/leads?unassigned=1",
          },
        ].map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-2xl border border-line bg-surface p-5 transition hover:border-canopy/40"
          >
            <h2 className="text-sm font-semibold text-ink">{card.label}</h2>
            <p className="mt-2 font-display text-3xl text-canopy">{card.value}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
