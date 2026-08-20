import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  token: z.string().trim().min(16).max(4096),
  /** When set, only delete if the row still belongs to this user. */
  onlyUserId: z.string().trim().min(1).max(128).optional(),
});

/**
 * Remove a single PushDevice row by FCM/APNs token.
 * Token possession is required. `onlyUserId` protects account-switch races
 * after an offline logout (do not delete a rebound token for user B).
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid token." }, { status: 400 });
  }

  const { token, onlyUserId } = parsed.data;
  // Touch auth so cookies/session middleware stay consistent on native.
  await auth();

  if (onlyUserId) {
    const result = await prisma.pushDevice.deleteMany({
      where: { token, userId: onlyUserId },
    });
    return NextResponse.json({ ok: true, removed: result.count > 0 });
  }

  const device = await prisma.pushDevice.findUnique({
    where: { token },
    select: { token: true },
  });
  if (!device) {
    return NextResponse.json({ ok: true, removed: false });
  }

  await prisma.pushDevice.delete({ where: { token } });
  return NextResponse.json({ ok: true, removed: true });
}
