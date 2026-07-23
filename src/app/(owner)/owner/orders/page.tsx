import Link from "next/link";
import { redirect } from "next/navigation";
import { formatPrice } from "@/lib/listings/constants";
import { requireOwnerUser } from "@/lib/owner/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Owner orders" };

export default async function OwnerOrdersPage() {
  const user = await requireOwnerUser();
  if (!user) redirect("/auth/sign-in?callbackUrl=/owner/orders");

  const orders = await prisma.ownerListingOrder.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      listing: {
        select: {
          id: true,
          addressLine: true,
          mlsNumber: true,
          ownerStatus: true,
        },
      },
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl text-ink">Orders</h1>
      <ul className="space-y-2">
        {orders.map((order) => (
          <li
            key={order.id}
            className="rounded-xl border border-line bg-surface px-4 py-3 text-sm"
          >
            <p className="font-semibold">
              {order.listing.addressLine} · {formatPrice(order.totalAmount)} CAD
            </p>
            <p className="text-ink/60">
              {order.paymentStatus} · listing {order.listing.ownerStatus} ·{" "}
              {order.createdAt.toLocaleString("en-CA")}
            </p>
            <div className="mt-2 flex flex-wrap gap-3 font-semibold">
              {order.paymentStatus === "PENDING" ? (
                <Link
                  href={`/owner/checkout/${order.id}`}
                  className="text-canopy"
                >
                  Checkout →
                </Link>
              ) : null}
              <Link
                href={`/owner/listings/${order.listing.id}`}
                className="text-ink/70 hover:text-canopy"
              >
                Manage listing
              </Link>
            </div>
          </li>
        ))}
      </ul>
      {orders.length === 0 ? (
        <p className="text-sm text-ink/55">No orders yet.</p>
      ) : null}
    </div>
  );
}
