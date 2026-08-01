import { PeopleAdminClient } from "@/components/admin/PeopleAdminClient";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "People · Admin HQ" };

export default async function AdminPeoplePage() {
  const users = await prisma.user.findMany({
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
    },
  });

  const people = users.map((u) => ({
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
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-ink">People</h1>
        <p className="mt-2 text-sm text-ink/60">
          Buyers, sellers, agents, and admins — roles, suspension, and journeys.
        </p>
      </div>
      <PeopleAdminClient people={people} />
    </div>
  );
}
