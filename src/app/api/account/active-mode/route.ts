import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { canAccessBuyerTools, canAccessSellerTools } from "@/lib/roles";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  activeMode: z.enum(["BUYER", "SELLER"]),
});

/** Switch buyer/seller dashboard mode for dual-profile consumers. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid mode." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      role: true,
      isBuyer: true,
      isSeller: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mode = parsed.data.activeMode;
  if (mode === "SELLER") {
    if (!canAccessSellerTools(user)) {
      return NextResponse.json(
        { error: "Seller profile is not enabled for this account." },
        { status: 403 },
      );
    }
  } else if (!canAccessBuyerTools(user)) {
    return NextResponse.json(
      { error: "Buyer profile is not enabled for this account." },
      { status: 403 },
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { activeMode: mode },
  });

  return NextResponse.json({ ok: true, activeMode: mode });
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    role: session.user.role,
    isBuyer: session.user.isBuyer,
    isSeller: session.user.isSeller,
    activeMode: session.user.activeMode,
  });
}
