import type { Prisma, Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ownerUserSelect = {
  id: true,
  email: true,
  name: true,
  image: true,
  phone: true,
  role: true,
} satisfies Prisma.UserSelect;

export type OwnerUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  phone: string | null;
  role: Role;
};

export async function requireOwnerUser(): Promise<OwnerUser | null> {
  const session = await auth();
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: ownerUserSelect,
  });
  if (!user) return null;
  if (user.role === "AGENT") return null;
  return user;
}

export async function requireAdminUser(): Promise<OwnerUser | null> {
  const session = await auth();
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: ownerUserSelect,
  });
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

export function generateOwnerMlsNumber(transactionType: "SALE" | "LEASE") {
  const prefix = transactionType === "LEASE" ? "FLBO" : "FSBO";
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${suffix}`;
}
