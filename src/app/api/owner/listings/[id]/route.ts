import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerUser } from "@/lib/owner/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  action: z.enum(["pause", "resume"]),
});

export async function POST(request: Request, { params }: Params) {
  const user = await requireOwnerUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const listing = await prisma.listing.findFirst({
    where: { id, ownerUserId: user.id, dataSource: "fsbo" },
  });
  if (!listing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (parsed.data.action === "pause") {
    if (listing.ownerStatus !== "ACTIVE") {
      return NextResponse.json(
        { error: "Only live listings can be paused." },
        { status: 400 },
      );
    }
    await prisma.listing.update({
      where: { id },
      data: { ownerStatus: "PAUSED" },
    });
  } else {
    if (listing.ownerStatus !== "PAUSED") {
      return NextResponse.json(
        { error: "Only paused listings can be resumed." },
        { status: 400 },
      );
    }
    await prisma.listing.update({
      where: { id },
      data: { ownerStatus: "ACTIVE", status: "ACTIVE" },
    });
  }

  return NextResponse.json({ ok: true });
}
