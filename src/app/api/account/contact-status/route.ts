import { NextResponse } from "next/server";
import { requireCustomerUser } from "@/lib/account";
import { needsEmailVerification } from "@/lib/account-access";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      email: true,
      phone: true,
      emailUpdateRequestedAt: true,
      phoneUpdateRequestedAt: true,
    },
  });

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const phoneRequested = row.phoneUpdateRequestedAt != null;
  const emailRequested = row.emailUpdateRequestedAt != null;
  const needPhone = !row.phone?.trim() || phoneRequested;
  const needEmail = emailRequested;

  return NextResponse.json({
    email: row.email,
    phone: row.phone,
    needPhone,
    needEmail,
    phoneRequested,
    emailRequested,
    needsEmailVerification: needsEmailVerification(user),
    emailVerified: Boolean(user.emailVerified),
  });
}
