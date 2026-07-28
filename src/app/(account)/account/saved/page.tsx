import Link from "next/link";
import { redirect } from "next/navigation";
import { ListingCard } from "@/components/listings/ListingCard";
import { requireCustomerUser } from "@/lib/account";
import { toCard } from "@/lib/listings/provider";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Saved homes" };

export default async function SavedHomesPage() {
  const user = await requireCustomerUser();
  if (!user) redirect("/auth/sign-in?callbackUrl=/account/saved");

  const saved = await prisma.savedListing.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  const listings = await prisma.listing.findMany({
    where: { mlsNumber: { in: saved.map((s) => s.mlsNumber) } },
    include: {
      media: { orderBy: { sortOrder: "asc" } },
      openHouses: { orderBy: { startsAt: "asc" } },
    },
  });

  const notes = await prisma.listingNote.findMany({
    where: {
      userId: user.id,
      mlsNumber: { in: saved.map((s) => s.mlsNumber) },
    },
    select: { mlsNumber: true, body: true },
  });
  const noteByMls = new Map(notes.map((n) => [n.mlsNumber, n.body]));

  const byMls = new Map(listings.map((l) => [l.mlsNumber, l]));

  const cards = saved
    .map((s) => byMls.get(s.mlsNumber))
    .filter(Boolean)
    .map((listing) => toCard(listing!));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-ink">Saved homes</h1>
        <p className="mt-2 text-sm text-ink/60">
          {saved.length} saved ·{" "}
          <Link href="/search" className="text-canopy">
            Continue searching
          </Link>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((listing) => {
          const note = noteByMls.get(listing.mlsNumber);
          return (
            <div key={listing.mlsNumber} className="space-y-2">
              <ListingCard listing={listing} />
              {note ? (
                <p className="line-clamp-2 px-1 text-xs text-ink/55">
                  Note: {note}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {saved.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink/55">
          No saved homes yet. Open a listing and tap Save home.
        </p>
      ) : null}
    </div>
  );
}
