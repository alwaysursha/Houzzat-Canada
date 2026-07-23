import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomerUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ mlsNumber: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { mlsNumber } = await params;
  const note = await prisma.listingNote.findUnique({
    where: {
      userId_mlsNumber: { userId: user.id, mlsNumber },
    },
  });

  return NextResponse.json({
    body: note?.body ?? "",
    updatedAt: note?.updatedAt ?? null,
  });
}

const putSchema = z.object({
  body: z.string().max(8000),
});

export async function PUT(request: Request, { params }: Params) {
  const user = await requireCustomerUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { mlsNumber } = await params;
  const parsed = putSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid note." }, { status: 400 });
  }

  const body = parsed.data.body.trim();
  if (!body) {
    await prisma.listingNote.deleteMany({
      where: { userId: user.id, mlsNumber },
    });
    return NextResponse.json({ body: "", updatedAt: null });
  }

  const note = await prisma.listingNote.upsert({
    where: {
      userId_mlsNumber: { userId: user.id, mlsNumber },
    },
    create: {
      userId: user.id,
      mlsNumber,
      body,
    },
    update: { body },
  });

  return NextResponse.json({
    body: note.body,
    updatedAt: note.updatedAt,
  });
}
