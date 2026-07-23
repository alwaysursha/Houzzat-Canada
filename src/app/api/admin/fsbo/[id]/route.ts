import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/owner/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const actionSchema = z.object({
  action: z.enum(["approve", "reject", "pause", "resume"]),
  note: z.string().trim().max(500).optional(),
});

export async function POST(request: Request, { params }: Params) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const listing = await prisma.listing.findFirst({
    where: { id, dataSource: "fsbo" },
  });
  if (!listing) {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  const { action, note } = parsed.data;
  const now = new Date();

  switch (action) {
    case "approve":
      await prisma.listing.update({
        where: { id },
        data: {
          ownerStatus: "ACTIVE",
          status: "ACTIVE",
          ownerReviewedAt: now,
          ownerReviewedById: admin.id,
          ownerReviewNote: note || null,
          listedAt: listing.listedAt || now,
        },
      });
      break;
    case "reject":
      await prisma.listing.update({
        where: { id },
        data: {
          ownerStatus: "REJECTED",
          ownerReviewedAt: now,
          ownerReviewedById: admin.id,
          ownerReviewNote: note || "Rejected by admin",
        },
      });
      break;
    case "pause":
      await prisma.listing.update({
        where: { id },
        data: { ownerStatus: "PAUSED" },
      });
      break;
    case "resume":
      await prisma.listing.update({
        where: { id },
        data: { ownerStatus: "ACTIVE", status: "ACTIVE" },
      });
      break;
    default: {
      const _exhaustive: never = action;
      return NextResponse.json(
        { error: `Unhandled action: ${_exhaustive}` },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}
