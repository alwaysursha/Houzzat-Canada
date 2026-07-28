import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isVowOnlyMlsMode } from "@/lib/proptx/config";
import { hasClientAccess } from "@/lib/vow";

/**
 * When PropTx VOW-only mode is on, MLS APIs require a registered Houzzat client.
 * Returns a 401 response to send, or null if the request may proceed.
 * Pass `allowAnonymousFsbo` when the caller is explicitly scoped to FSBO.
 */
export async function mlsClientGate(options?: {
  allowAnonymousFsbo?: boolean;
  dataSource?: string | null;
}): Promise<NextResponse | null> {
  if (!isVowOnlyMlsMode()) return null;
  if (
    options?.allowAnonymousFsbo &&
    options.dataSource?.toLowerCase() === "fsbo"
  ) {
    return null;
  }

  const session = await auth();
  const user = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
      })
    : null;

  if (hasClientAccess(user)) return null;

  return NextResponse.json(
    {
      error: "VOW access requires a Houzzat account.",
      requiresAuth: true,
      vowOnly: true,
    },
    { status: 401 },
  );
}
