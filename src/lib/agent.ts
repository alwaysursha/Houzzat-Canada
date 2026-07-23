import { prisma } from "@/lib/prisma";
import { isAdminRole, isAgentRole } from "@/lib/constants";
import { auth } from "@/lib/auth";

export async function requireAgentUser() {
  const session = await auth();
  if (!session?.user) return null;

  const user = await prisma.user.findFirst({
    where: session.user.id
      ? { id: session.user.id }
      : { email: session.user.email },
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
  });
  return agent?.id ?? null;
}

export function canManageAllLeads(role: string) {
  return isAdminRole(role);
}
