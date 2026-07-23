import { notFound, redirect } from "next/navigation";
import { OwnerCheckoutClient } from "@/components/owner/OwnerCheckoutClient";
import { requireOwnerUser } from "@/lib/owner/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ orderId: string }> };

export default async function OwnerCheckoutPage({ params }: Params) {
  const user = await requireOwnerUser();
  if (!user) redirect("/auth/sign-in?callbackUrl=/owner");

  const { orderId } = await params;
  const order = await prisma.ownerListingOrder.findUnique({
    where: { id: orderId },
    include: { listing: true },
  });
  if (!order || order.userId !== user.id) notFound();

  return (
    <OwnerCheckoutClient
      orderId={order.id}
      totalAmount={order.totalAmount}
      mlsNumber={order.listing.mlsNumber}
    />
  );
}
