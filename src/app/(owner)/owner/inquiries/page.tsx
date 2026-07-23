import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOwnerUser } from "@/lib/owner/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Owner inquiries" };

export default async function OwnerInquiriesPage() {
  const user = await requireOwnerUser();
  if (!user) redirect("/auth/sign-in?callbackUrl=/owner/inquiries");

  const listings = await prisma.listing.findMany({
    where: { ownerUserId: user.id, dataSource: "fsbo" },
    select: { mlsNumber: true, addressLine: true, id: true },
  });
  const mls = listings.map((l) => l.mlsNumber);
  const byMls = new Map(listings.map((l) => [l.mlsNumber, l]));

  const leads =
    mls.length === 0
      ? []
      : await prisma.lead.findMany({
          where: { listingMls: { in: mls } },
          orderBy: { createdAt: "desc" },
          take: 50,
        });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl text-ink">Inquiries</h1>
      <ul className="space-y-2">
        {leads.map((lead) => {
          const listing = lead.listingMls
            ? byMls.get(lead.listingMls)
            : undefined;
          return (
            <li
              key={lead.id}
              className="rounded-xl border border-line bg-surface px-4 py-3 text-sm"
            >
              <p className="font-semibold">
                {listing?.addressLine ?? lead.listingMls ?? "General"}
              </p>
              <p className="text-ink/60">
                {lead.source} · {lead.status} ·{" "}
                {lead.createdAt.toLocaleString("en-CA")}
              </p>
              {listing ? (
                <Link
                  href={`/owner/listings/${listing.id}`}
                  className="mt-1 inline-block text-canopy"
                >
                  Open listing
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
      {leads.length === 0 ? (
        <p className="text-sm text-ink/55">No inquiries across your listings.</p>
      ) : null}
    </div>
  );
}
