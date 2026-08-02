import { PeopleAdminClient } from "@/components/admin/PeopleAdminClient";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "People · Admin HQ" };

export default async function AdminPeoplePage() {
  const [users, agents] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isBuyer: true,
        isSeller: true,
        disabledAt: true,
        createdAt: true,
        _count: { select: { leads: true } },
        siteVisitors: {
          orderBy: { lastSeenAt: "desc" },
          take: 1,
          select: { lastSeenAt: true },
        },
        leads: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: {
            assignedAgentId: true,
            assignedAgent: { select: { id: true, name: true, email: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: {
        role: { in: ["AGENT", "ADMIN"] },
        disabledAt: null,
      },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      take: 100,
    }),
  ]);

  const people = users.map((u) => {
    const latestLead = u.leads[0];
    const assigned = latestLead?.assignedAgent ?? null;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      isBuyer: u.isBuyer,
      isSeller: u.isSeller,
      disabledAt: u.disabledAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
      leadCount: u._count.leads,
      lastSeenAt: u.siteVisitors[0]?.lastSeenAt.toISOString() ?? null,
      assignedAgentId: latestLead?.assignedAgentId ?? null,
      assignedAgentLabel: assigned
        ? assigned.name || assigned.email
        : u._count.leads > 0
          ? "Pond (unassigned)"
          : null,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-ink">People</h1>
        <p className="mt-2 text-sm text-ink/60">
          Buyers, sellers, agents, and admins — roles, lead assignment,
          suspension, and journeys.
        </p>
      </div>
      <PeopleAdminClient people={people} agents={agents} />
    </div>
  );
}
