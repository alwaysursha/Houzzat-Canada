import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import { recordActivityEvent } from "@/lib/analytics/record-activity";
import { prisma } from "@/lib/prisma";

/** Saved searches are account prefs — require sign-in only (not email verify). */
function denySavedSearchAccess(
  user: Awaited<ReturnType<typeof requireCustomerUser>>,
) {
  if (!user) {
    return NextResponse.json(
      { error: "Sign in required.", requiresAuth: true },
      { status: 401 },
    );
  }
  return null;
}

export async function GET() {
  const user = await requireCustomerUser();
  const denied = denySavedSearchAccess(user);
  if (denied) return denied;

  const items = await prisma.savedSearch.findMany({
    where: { userId: user!.id },
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
  const denied = denySavedSearchAccess(user);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid search.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const applyToHomepage = parsed.data.applyToHomepage ?? false;
  const asPrimary = parsed.data.asPrimary ?? false;

  try {
    const item = await prisma.$transaction(async (tx) => {
      if (applyToHomepage) {
        await tx.savedSearch.updateMany({
          where: { userId: user!.id, isHomepageActive: true },
          data: { isHomepageActive: false },
        });
      }
      if (asPrimary) {
        await tx.savedSearch.updateMany({
          where: { userId: user!.id, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return tx.savedSearch.create({
        data: {
          userId: user!.id,
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
      userId: user!.id,
      path: "/account/searches",
      title: `Saved search: ${item.name}`,
      meta: { searchId: item.id },
    });

    return NextResponse.json({ ok: true, item });
  } catch (error) {
    console.error("[saved-searches] POST failed", error);
    return NextResponse.json(
      { error: "Could not save search." },
      { status: 500 },
    );
  }
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
  const denied = denySavedSearchAccess(user);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid update.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id, isHomepageActive, isPrimary, query, ...data } = parsed.data;

  const existing = await prisma.savedSearch.findFirst({
    where: { id, userId: user!.id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const item = await prisma.$transaction(async (tx) => {
      if (isHomepageActive === true) {
        await tx.savedSearch.updateMany({
          where: { userId: user!.id, isHomepageActive: true },
          data: { isHomepageActive: false },
        });
      }
      if (isPrimary === true) {
        await tx.savedSearch.updateMany({
          where: { userId: user!.id, isPrimary: true },
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
          ...(data.smsAlerts !== undefined
            ? { smsAlerts: data.smsAlerts }
            : {}),
          ...(isHomepageActive !== undefined ? { isHomepageActive } : {}),
          ...(isPrimary !== undefined ? { isPrimary } : {}),
          ...(query !== undefined
            ? { query: query as Prisma.InputJsonValue }
            : {}),
        },
      });
    });

    return NextResponse.json({ ok: true, item });
  } catch (error) {
    console.error("[saved-searches] PATCH failed", error);
    return NextResponse.json(
      { error: "Could not update search." },
      { status: 500 },
    );
  }
}

const deleteSchema = z.object({
  id: z.string().min(1),
});

export async function DELETE(request: Request) {
  const user = await requireCustomerUser();
  const denied = denySavedSearchAccess(user);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  await prisma.savedSearch.deleteMany({
    where: { id: parsed.data.id, userId: user!.id },
  });

  return NextResponse.json({ ok: true });
}
