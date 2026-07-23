import Link from "next/link";
import { redirect } from "next/navigation";
import type { OwnerListingStatus } from "@prisma/client";
import { formatListPrice, formatPrice } from "@/lib/listings/constants";
import { requireOwnerUser } from "@/lib/owner/auth";
import { ownerListingTag } from "@/lib/owner/pricing";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Owner listings" };

function statusLabel(status: OwnerListingStatus | null | undefined) {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "PENDING_PAYMENT":
      return "Awaiting payment";
    case "PENDING_REVIEW":
      return "Awaiting admin approval";
    case "ACTIVE":
      return "Live";
    case "PAUSED":
      return "Paused";
    case "EXPIRED":
      return "Expired";
    case "CANCELLED":
      return "Cancelled";
    case "REJECTED":
      return "Rejected";
    case null:
    case undefined:
      return "—";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export default async function OwnerHomePage() {
  const user = await requireOwnerUser();
  if (!user) redirect("/auth/sign-in?callbackUrl=/owner");

  const listings = await prisma.listing.findMany({
    where: { ownerUserId: user.id, dataSource: "fsbo" },
    orderBy: { updatedAt: "desc" },
    include: {
      ownerOrders: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const rows = await Promise.all(
    listings.map(async (listing) => {
      const [views, inquiries] = await Promise.all([
        prisma.listingView.count({ where: { mlsNumber: listing.mlsNumber } }),
        prisma.lead.count({ where: { listingMls: listing.mlsNumber } }),
      ]);
      return { listing, views, inquiries };
    }),
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl text-ink">My listings</h1>
          <p className="mt-2 text-sm text-ink/60">
            List for sale (FSBO) or lease (FLBO). Paid listings require admin
            approval before they appear on Houzzat.
          </p>
        </div>
        <Link
          href="/owner/new"
          className="rounded-lg bg-canopy px-4 py-2 text-sm font-semibold text-white hover:bg-canopy-deep"
        >
          New listing
        </Link>
      </div>

      <div className="space-y-3">
        {rows.map(({ listing, views, inquiries }) => {
          const order = listing.ownerOrders[0];
          const tag = ownerListingTag(listing.transactionType);
          return (
            <article
              key={listing.id}
              className="rounded-2xl border border-line bg-surface p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-canopy">
                    {tag} · {statusLabel(listing.ownerStatus)}
                  </p>
                  <h2 className="mt-1 font-display text-2xl text-ink">
                    {listing.addressLine}
                    {listing.unitNumber ? `, Unit ${listing.unitNumber}` : ""}
                  </h2>
                  <p className="text-sm text-ink/60">
                    {listing.city}
                    {listing.community ? ` · ${listing.community}` : ""} ·{" "}
                    {formatListPrice(
                      listing.listPrice,
                      listing.transactionType,
                    )}
                  </p>
                </div>
                <div className="text-right text-sm text-ink/65">
                  <p>{views} views</p>
                  <p>{inquiries} inquiries</p>
                  {order ? (
                    <p className="mt-1">
                      Order {formatPrice(order.totalAmount)} ·{" "}
                      {order.paymentStatus}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
                {listing.ownerStatus === "PENDING_PAYMENT" && order ? (
                  <Link
                    href={`/owner/checkout/${order.id}`}
                    className="text-canopy hover:underline"
                  >
                    Complete payment →
                  </Link>
                ) : null}
                {listing.ownerStatus === "ACTIVE" ? (
                  <Link
                    href={`/listing/${listing.mlsNumber}`}
                    className="text-canopy hover:underline"
                  >
                    View public page →
                  </Link>
                ) : null}
                <Link
                  href={`/owner/listings/${listing.id}`}
                  className="text-ink/70 hover:text-canopy"
                >
                  Manage
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink/55">
          No owner listings yet.{" "}
          <Link href="/owner/new" className="font-semibold text-canopy">
            Create your first FSBO/FLBO listing
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
