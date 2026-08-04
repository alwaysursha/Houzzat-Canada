import { NextResponse } from "next/server";
import { resolveClientAccess } from "@/lib/account-access";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Public access snapshot for client gates (visitor / grace / verify-locked). */
export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({
      kind: "visitor" as const,
      isSignedIn: false,
      hasClientAccess: false,
      needsEmailVerification: false,
      email: null,
    });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      createdAt: true,
    },
  });

  const access = resolveClientAccess(user);
  return NextResponse.json({
    ...access,
    email: user?.email ?? email,
  });
}
