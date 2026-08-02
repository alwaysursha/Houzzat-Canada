import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import { recordActivityEvent } from "@/lib/analytics/record-activity";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const items = await prisma.savedSearch.findMany({
    where: { userId: user.id },
    orderBy: [
      { isPrimary: "desc" },
      { isHomepageActive: "desc" },
      { createdAt: "desc" },
    ],
  });

  return NextResponse.json({ items });
}

const postSchema = z.object({
  name: z.string().trim().min(1).max(120),
  query: z.record(z.string(), z.unknown()),
  emailAlerts: z.boolean().optional(),
  applyToHomepage: z.boolean().optional(),
  /** Latest buyer-profile search; demotes any previous primary. */
  asPrimary: z.boolean().optional(),
});

export async function POST(request: Request) {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = await request.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid search." }, { status: 400 });
  }

  const applyToHomepage = parsed.data.applyToHomepage ?? false;
  const asPrimary = parsed.data.asPrimary ?? false;

  const item = await prisma.$transaction(async (tx) => {
    if (applyToHomepage) {
      await tx.savedSearch.updateMany({
        where: { userId: user.id, isHomepageActive: true },
        data: { isHomepageActive: false },
      });
    }
    if (asPrimary) {
      await tx.savedSearch.updateMany({
        where: { userId: user.id, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return tx.savedSearch.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        query: parsed.data.query as Prisma.InputJsonValue,
        emailAlerts: parsed.data.emailAlerts ?? true,
        isHomepageActive: applyToHomepage,
        isPrimary: asPrimary,
      },
    });
  });

  void recordActivityEvent({
    type: "SAVE_SEARCH",
    userId: user.id,
    path: "/account/searches",
    title: `Saved search: ${item.name}`,
    meta: { searchId: item.id },
  });

  return NextResponse.json({ ok: true, item });
}

const patchSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  emailAlerts: z.boolean().optional(),
  smsAlerts: z.boolean().optional(),
  isHomepageActive: z.boolean().optional(),
  isPrimary: z.boolean().optional(),
  query: z.record(z.string(), z.unknown()).optional(),
});

export async function PATCH(request: Request) {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update." }, { status: 400 });
  }

  const { id, isHomepageActive, isPrimary, query, ...data } = parsed.data;

  const existing = await prisma.savedSearch.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const item = await prisma.$transaction(async (tx) => {
    if (isHomepageActive === true) {
      await tx.savedSearch.updateMany({
        where: { userId: user.id, isHomepageActive: true },
        data: { isHomepageActive: false },
      });
    }
    if (isPrimary === true) {
      await tx.savedSearch.updateMany({
        where: { userId: user.id, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return tx.savedSearch.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.emailAlerts !== undefined
          ? { emailAlerts: data.emailAlerts }
          : {}),
        ...(data.smsAlerts !== undefined ? { smsAlerts: data.smsAlerts } : {}),
        ...(isHomepageActive !== undefined ? { isHomepageActive } : {}),
        ...(isPrimary !== undefined ? { isPrimary } : {}),
        ...(query !== undefined
          ? { query: query as Prisma.InputJsonValue }
          : {}),
      },
    });
  });

  return NextResponse.json({ ok: true, item });
}

const deleteSchema = z.object({
  id: z.string().min(1),
});

export async function DELETE(request: Request) {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = await request.json();
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  await prisma.savedSearch.deleteMany({
    where: { id: parsed.data.id, userId: user.id },
  });

  return NextResponse.json({ ok: true });
}
