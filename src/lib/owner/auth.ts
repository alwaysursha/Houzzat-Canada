import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function requireOwnerUser() {
  const session = await auth();
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user) return null;
  if (user.role === "AGENT") return null;
  return user;
}

export async function requireAdminUser() {
  const session = await auth();
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (!user || user.role !== "ADMIN") return null;
  return user;
}

export function generateOwnerMlsNumber(transactionType: "SALE" | "LEASE") {
  const prefix = transactionType === "LEASE" ? "FLBO" : "FSBO";
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${suffix}`;
}
