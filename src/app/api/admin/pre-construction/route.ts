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

const schema = z.object({
  id: z.string().optional(),
  mlsNumber: z.string().trim().min(3).max(32),
  addressLine: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(80),
  community: z.string().trim().max(120).optional(),
  listPrice: z.number().int().positive(),
  beds: z.number().min(0).max(20).default(0),
  baths: z.number().min(0).max(20).default(0),
  description: z.string().trim().min(10).max(5000),
  imageUrl: z.string().url().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  published: z.boolean().optional(),
});

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await prisma.listing.findMany({
    where: { segment: "PRE_CONSTRUCTION" },
    include: { media: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid project." }, { status: 400 });
  }

  const data = parsed.data;
  const image =
    data.imageUrl ??
    "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1600&q=80";

  if (data.id) {
    const item = await prisma.listing.update({
      where: { id: data.id },
      data: {
        mlsNumber: data.mlsNumber,
        addressLine: data.addressLine,
        city: data.city,
        community: data.community,
        listPrice: data.listPrice,
        beds: data.beds,
        baths: data.baths,
        description: data.description,
        status: data.published === false ? "SUSPENDED" : "ACTIVE",
        lat: data.lat ?? 43.65,
        lng: data.lng ?? -79.38,
      },
    });
    return NextResponse.json({ ok: true, item });
  }

  const item = await prisma.listing.create({
    data: {
      mlsNumber: data.mlsNumber,
      segment: "PRE_CONSTRUCTION",
      dataSource: "manual",
      isMock: false,
      status: data.published === false ? "SUSPENDED" : "ACTIVE",
      propertyType: "CONDO_APT",
      listPrice: data.listPrice,
      beds: data.beds,
      baths: data.baths,
      addressLine: data.addressLine,
      city: data.city,
      community: data.community,
      postalCode: "",
      lat: data.lat ?? 43.65,
      lng: data.lng ?? -79.38,
      description: data.description,
      brokerageName: "Houzzat Pre-Construction Desk",
      listedAt: new Date(),
      updatedAtMls: new Date(),
      daysOnMarket: 0,
      media: {
        create: [{ url: image, sortOrder: 0, isPrimary: true }],
      },
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
  await prisma.listing.delete({ where: { id: body.id } });
  return NextResponse.json({ ok: true });
}
