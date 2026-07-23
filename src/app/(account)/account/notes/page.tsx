import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCustomerUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Your notes" };

export default async function AccountNotesPage() {
  const user = await requireCustomerUser();
  if (!user) redirect("/auth/sign-in?callbackUrl=/account/notes");

  const notes = await prisma.listingNote.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
  });

  const listings = await prisma.listing.findMany({
    where: { mlsNumber: { in: notes.map((n) => n.mlsNumber) } },
    select: {
      mlsNumber: true,
      addressLine: true,
      unitNumber: true,
      city: true,
      community: true,
      listPrice: true,
      transactionType: true,
    },
  });
  const byMls = new Map(listings.map((l) => [l.mlsNumber, l]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-ink">Your notes</h1>
        <p className="mt-2 text-sm text-ink/60">
          Private notes synced to your account — open a listing to edit.
        </p>
      </div>

      <ul className="space-y-3">
        {notes.map((note) => {
          const listing = byMls.get(note.mlsNumber);
          const title = listing
            ? [
                listing.unitNumber
                  ? `${listing.unitNumber} – ${listing.addressLine}`
                  : listing.addressLine,
                listing.city,
              ].join(", ")
            : note.mlsNumber;

          return (
            <li
              key={note.id}
              className="rounded-2xl border border-line bg-surface px-5 py-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/listing/${note.mlsNumber}`}
                    className="font-display text-xl text-ink hover:text-canopy"
                  >
                    {title}
                  </Link>
                  <p className="mt-1 text-xs text-ink/45">
                    MLS® {note.mlsNumber} · updated{" "}
                    {note.updatedAt.toLocaleString("en-CA")}
                  </p>
                </div>
                <Link
                  href={`/listing/${note.mlsNumber}`}
                  className="shrink-0 text-sm font-semibold text-canopy"
                >
                  Edit note →
                </Link>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-ink/75">
                {note.body}
              </p>
            </li>
          );
        })}
      </ul>

      {notes.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink/55">
          No notes yet. Open any listing and write in{" "}
          <span className="font-semibold text-ink/70">Your notes</span>.
        </p>
      ) : null}
    </div>
  );
}
