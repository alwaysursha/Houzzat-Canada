import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAgentUser } from "@/lib/agent";
import { isAdminRole } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const user = await requireAgentUser();
  if (!user || !isAdminRole(user.role)) return null;
  return user;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const items = await prisma.referralPartner.findMany({
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ items });
}

const schema = z.object({
  id: z.string().optional(),
  type: z.enum(["MORTGAGE", "LAWYER", "INSPECTOR", "OTHER"]),
  name: z.string().min(2).max(120),
  company: z.string().max(160).optional(),
  email: z.string().email(),
  phone: z.string().max(40).optional(),
  city: z.string().max(80).optional(),
  bio: z.string().max(2000).optional(),
  active: z.boolean().optional(),
});

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid partner" }, { status: 400 });
  }
  const data = parsed.data;
  const item = data.id
    ? await prisma.referralPartner.update({
        where: { id: data.id },
        data: {
          type: data.type,
          name: data.name,
          company: data.company,
          email: data.email,
          phone: data.phone,
          city: data.city,
          bio: data.bio,
          active: data.active ?? true,
        },
      })
    : await prisma.referralPartner.create({
        data: {
          type: data.type,
          name: data.name,
          company: data.company,
          email: data.email,
          phone: data.phone,
          city: data.city,
          bio: data.bio,
          active: data.active ?? true,
        },
      });
  return NextResponse.json({ ok: true, item });
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as { id?: string };
  if (!body.id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  await prisma.referralPartner.delete({ where: { id: body.id } });
  return NextResponse.json({ ok: true });
}
