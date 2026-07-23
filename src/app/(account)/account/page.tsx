import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertPreferencesForm } from "@/components/account/AlertPreferencesForm";
import { VowAcceptCard } from "@/components/account/VowAcceptCard";
import { requireCustomerUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { hasVowAccess } from "@/lib/vow";

export const metadata = { title: "Your Houzzat" };

export default async function AccountPage() {
  const user = await requireCustomerUser();
  if (!user) {
    redirect("/auth/sign-in?callbackUrl=/account");
  }

  const [
    savedCount,
    searchCount,
    noteCount,
    propertyWatchCount,
    areaWatchCount,
    alertCount,
    leadCount,
    appointmentCount,
    viewCount,
    recentNotes,
  ] = await Promise.all([
    prisma.savedListing.count({ where: { userId: user.id } }),
    prisma.savedSearch.count({ where: { userId: user.id } }),
    prisma.listingNote.count({ where: { userId: user.id } }),
    prisma.propertyMonitor.count({ where: { userId: user.id } }),
    prisma.areaMonitor.count({ where: { userId: user.id } }),
    prisma.customerAlert.count({ where: { userId: user.id, readAt: null } }),
    prisma.lead.count({ where: { customerId: user.id } }),
    prisma.appointment.count({ where: { customerId: user.id } }),
    prisma.listingView.count({ where: { userId: user.id } }),
    prisma.listingNote.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  const noteListings =
    recentNotes.length === 0
      ? []
      : await prisma.listing.findMany({
          where: {
            mlsNumber: { in: recentNotes.map((n) => n.mlsNumber) },
          },
          select: {
            mlsNumber: true,
            addressLine: true,
            unitNumber: true,
            city: true,
          },
        });
  const listingByMls = new Map(noteListings.map((l) => [l.mlsNumber, l]));

  const vowOk = hasVowAccess(user);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-4xl text-ink">Your Houzzat</h1>
        <p className="mt-2 text-sm text-ink/60">
          Saved homes, notes, searches, and monitors — signed in as {user.email}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Saved homes", value: savedCount, href: "/account/saved" },
          { label: "Notes", value: noteCount, href: "/account/notes" },
          {
            label: "Saved searches",
            value: searchCount,
            href: "/account/searches",
          },
          {
            label: "Monitors",
            value: propertyWatchCount + areaWatchCount,
            href: "/account/monitors",
            hint: alertCount > 0 ? `${alertCount} new alerts` : undefined,
          },
          {
            label: "Inquiries & showings",
            value: leadCount + appointmentCount,
            href: "/account/activity",
          },
        ].map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-2xl border border-line bg-surface p-5 transition hover:border-canopy/40"
          >
            <h2 className="font-semibold text-ink">{card.label}</h2>
            <p className="mt-2 font-display text-3xl text-canopy">{card.value}</p>
            {"hint" in card && card.hint ? (
              <p className="mt-1 text-xs text-signal">{card.hint}</p>
            ) : null}
          </Link>
        ))}
      </div>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-2xl text-ink">Recent notes</h2>
          {noteCount > 0 ? (
            <Link
              href="/account/notes"
              className="text-sm font-semibold text-canopy"
            >
              See all →
            </Link>
          ) : null}
        </div>
        {recentNotes.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-surface p-6 text-sm text-ink/55">
            Notes you write on a listing show up here — they don’t require
            saving the home first.
          </p>
        ) : (
          <ul className="space-y-2">
            {recentNotes.map((note) => {
              const listing = listingByMls.get(note.mlsNumber);
              const title = listing
                ? `${listing.unitNumber ? `${listing.unitNumber} – ` : ""}${listing.addressLine}, ${listing.city}`
                : note.mlsNumber;
              return (
                <li key={note.id}>
                  <Link
                    href={`/listing/${note.mlsNumber}`}
                    className="block rounded-xl border border-line bg-surface px-4 py-3 transition hover:border-canopy/40"
                  >
                    <p className="font-semibold text-ink">{title}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-ink/60">
                      {note.body}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-sm text-ink/55">Homes viewed: {viewCount}</p>

      {!vowOk ? (
        <VowAcceptCard callbackPath="/account" />
      ) : (
        <div className="rounded-2xl border border-canopy/20 bg-canopy/5 px-4 py-3 text-sm text-canopy-deep">
          Client access active — sold prices and listing history unlocked.
        </div>
      )}

      <AlertPreferencesForm
        emailAlertsEnabled={user.emailAlertsEnabled}
        smsAlertsEnabled={user.smsAlertsEnabled}
        phone={user.phone}
      />
    </div>
  );
}
