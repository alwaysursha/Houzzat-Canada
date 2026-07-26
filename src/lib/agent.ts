import type { Prisma, Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { isAdminRole, isAgentRole } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

const agentUserSelect = {
  id: true,
  email: true,
  name: true,
  image: true,
  phone: true,
  role: true,
} satisfies Prisma.UserSelect;

export type AgentUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  phone: string | null;
  role: Role;
};

export async function requireAgentUser(): Promise<AgentUser | null> {
  const session = await auth();
  if (!session?.user) return null;

  const user = await prisma.user.findFirst({
    where: session.user.id
      ? { id: session.user.id }
      : { email: session.user.email },
    select: agentUserSelect,
  });

  if (!user || !isAgentRole(user.role)) return null;
  return user;
}

export async function pickAssigneeAgentId() {
  const agent = await prisma.user.findFirst({
    where: {
      role: "AGENT",
      agentProfile: { active: true },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return agent?.id ?? null;
}

export function canManageAllLeads(role: string) {
  return isAdminRole(role);
}
