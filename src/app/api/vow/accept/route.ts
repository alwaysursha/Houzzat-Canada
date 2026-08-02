import { NextResponse } from "next/server";
import { requireFullCustomerUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { VOW_VERSION } from "@/lib/vow";

export async function POST(request: Request) {
  const access = await requireFullCustomerUser();
  if (access.denied) return access.denied;
  const user = access.user;

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? null;
  const userAgent = request.headers.get("user-agent");

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        vowAcceptedAt: new Date(),
        vowVersion: VOW_VERSION,
        caslConsentAt: user.caslConsentAt ?? new Date(),
      },
      select: { id: true },
    }),
    prisma.consentEvent.create({
      data: {
        userId: user.id,
        kind: "VOW",
        version: VOW_VERSION,
        ip,
        userAgent,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, vowVersion: VOW_VERSION });
}
