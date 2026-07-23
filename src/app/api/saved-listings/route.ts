import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const mlsNumber = new URL(request.url).searchParams.get("mlsNumber");
  if (mlsNumber) {
    const item = await prisma.savedListing.findUnique({
      where: {
        userId_mlsNumber: { userId: user.id, mlsNumber },
      },
      select: { id: true },
    });
    return NextResponse.json({ saved: Boolean(item) });
  }

  const saved = await prisma.savedListing.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ items: saved });
}

const postSchema = z.object({
  mlsNumber: z.string().min(3).max(32),
});

export async function POST(request: Request) {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = await request.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid listing." }, { status: 400 });
  }

  const listing = await prisma.listing.findUnique({
    where: { mlsNumber: parsed.data.mlsNumber },
    select: { mlsNumber: true },
  });
  if (!listing) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  const item = await prisma.savedListing.upsert({
    where: {
      userId_mlsNumber: {
        userId: user.id,
        mlsNumber: listing.mlsNumber,
      },
    },
    update: {},
    create: {
      userId: user.id,
      mlsNumber: listing.mlsNumber,
    },
  });

  return NextResponse.json({ ok: true, item });
}

const deleteSchema = z.object({
  mlsNumber: z.string().min(3).max(32),
});

export async function DELETE(request: Request) {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = await request.json();
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid listing." }, { status: 400 });
  }

  await prisma.savedListing.deleteMany({
    where: { userId: user.id, mlsNumber: parsed.data.mlsNumber },
  });

  return NextResponse.json({ ok: true });
}
