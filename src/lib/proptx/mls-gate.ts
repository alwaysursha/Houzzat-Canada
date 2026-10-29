import { NextResponse } from "next/server";
import { needsEmailVerification } from "@/lib/account-access";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isVowOnlyMlsMode } from "@/lib/proptx/config";
import { hasClientAccess, vowAccountRequiredError } from "@/lib/vow";
import { currentPublicBrandName } from "@/lib/tenancy/resolve-marketing-tenancy";

/**
 * When PropTx VOW-only mode is on, MLS APIs require a registered Houzzat client
 * with verified email (or grace). Returns an error response, or null to proceed.
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
        where: { id: session.user.id },
        select: { id: true, emailVerified: true, createdAt: true },
      })
    : null;

  if (hasClientAccess(user)) return null;

  if (needsEmailVerification(user)) {
    return NextResponse.json(
      {
        error: "Email verification required.",
        requiresEmailVerification: true,
        vowOnly: true,
      },
      { status: 403 },
    );
  }

  return NextResponse.json(
    {
      error: vowAccountRequiredError(await currentPublicBrandName()),
      requiresAuth: true,
      vowOnly: true,
    },
    { status: 401 },
  );
}
