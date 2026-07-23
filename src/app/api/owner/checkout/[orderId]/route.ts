import { NextResponse } from "next/server";
import { requireOwnerUser } from "@/lib/owner/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ orderId: string }> };

/** Stripe stub — marks paid and moves listing to admin review. */
export async function POST(_request: Request, { params }: Params) {
  const user = await requireOwnerUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await params;
  const order = await prisma.ownerListingOrder.findUnique({
    where: { id: orderId },
    include: { listing: true },
  });

  if (!order || order.userId !== user.id) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (order.paymentStatus === "PAID" || order.paymentStatus === "WAIVED") {
    return NextResponse.json({
      ok: true,
      ownerStatus: order.listing.ownerStatus,
    });
  }

  await prisma.$transaction([
    prisma.ownerListingOrder.update({
      where: { id: order.id },
      data: {
        paymentStatus: "PAID",
        stripeCheckoutSessionId: `stub_${order.id}`,
      },
    }),
    prisma.listing.update({
      where: { id: order.listingId },
      data: { ownerStatus: "PENDING_REVIEW" },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    ownerStatus: "PENDING_REVIEW",
    message: "Payment recorded (Stripe stub). Listing awaits admin approval.",
  });
}
