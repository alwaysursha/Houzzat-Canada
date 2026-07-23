import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const items = await prisma.propertyMonitor.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ items });
}

const postSchema = z.object({
  mlsNumber: z.string().trim().min(1),
  emailAlerts: z.boolean().optional(),
});

export async function POST(request: Request) {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const parsed = postSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid listing." }, { status: 400 });
  }

  const listing = await prisma.listing.findUnique({
    where: { mlsNumber: parsed.data.mlsNumber },
    select: {
      mlsNumber: true,
      listPrice: true,
      status: true,
      ownerStatus: true,
    },
  });
  if (!listing) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  const item = await prisma.propertyMonitor.upsert({
    where: {
      userId_mlsNumber: {
        userId: user.id,
        mlsNumber: listing.mlsNumber,
      },
    },
    create: {
      userId: user.id,
      mlsNumber: listing.mlsNumber,
      emailAlerts: parsed.data.emailAlerts ?? true,
      lastKnownPrice: listing.listPrice,
      lastKnownStatus: listing.status,
      lastKnownOwnerStatus: listing.ownerStatus,
    },
    update: {
      emailAlerts: parsed.data.emailAlerts ?? true,
      lastKnownPrice: listing.listPrice,
      lastKnownStatus: listing.status,
      lastKnownOwnerStatus: listing.ownerStatus,
    },
  });

  return NextResponse.json({ ok: true, item });
}

const deleteSchema = z.object({
  mlsNumber: z.string().trim().min(1),
});

export async function DELETE(request: Request) {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const parsed = deleteSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid listing." }, { status: 400 });
  }

  await prisma.propertyMonitor.deleteMany({
    where: { userId: user.id, mlsNumber: parsed.data.mlsNumber },
  });

  return NextResponse.json({ ok: true });
}
