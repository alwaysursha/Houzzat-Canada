import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/admin/audit";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const ROLES = new Set(["BUYER", "SELLER", "AGENT", "ADMIN"]);

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as {
    role?: string;
    disabled?: boolean;
    isBuyer?: boolean;
    isSeller?: boolean;
  } | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (id === session.user.id) {
    if (body.role && body.role !== "ADMIN") {
      return NextResponse.json(
        { error: "You can’t demote your own admin account." },
        { status: 400 },
      );
    }
    if (body.disabled === true) {
      return NextResponse.json(
        { error: "You can’t suspend yourself." },
        { status: 400 },
      );
    }
  }

  const data: {
    role?: "BUYER" | "SELLER" | "AGENT" | "ADMIN";
    disabledAt?: Date | null;
    isBuyer?: boolean;
    isSeller?: boolean;
  } = {};

  if (body.role != null) {
    if (!ROLES.has(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    data.role = body.role as "BUYER" | "SELLER" | "AGENT" | "ADMIN";
  }
  if (typeof body.disabled === "boolean") {
    data.disabledAt = body.disabled ? new Date() : null;
  }
  if (typeof body.isBuyer === "boolean") data.isBuyer = body.isBuyer;
  if (typeof body.isSeller === "boolean") data.isSeller = body.isSeller;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      email: true,
      role: true,
      disabledAt: true,
      isBuyer: true,
      isSeller: true,
    },
  });

  if (data.role === "AGENT") {
    await prisma.agentProfile.upsert({
      where: { userId: id },
      create: { userId: id, active: true },
      update: { active: true },
    });
  }

  await writeAuditLog({
    actorId: session.user.id,
    action: "user.update",
    entityType: "User",
    entityId: id,
    summary: `Updated ${user.email}`,
    meta: {
      role: body.role ?? null,
      disabled: body.disabled ?? null,
      isBuyer: body.isBuyer ?? null,
      isSeller: body.isSeller ?? null,
    },
  });

  return NextResponse.json({ ok: true, user });
}
