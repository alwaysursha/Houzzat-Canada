import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OwnerAppointmentActions } from "@/components/owner/OwnerAppointmentActions";
import { OwnerListingActions } from "@/components/owner/OwnerListingActions";
import { formatListPrice } from "@/lib/listings/constants";
import { requireOwnerUser } from "@/lib/owner/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export default async function OwnerListingManagePage({ params }: Params) {
  const user = await requireOwnerUser();
  if (!user) redirect("/auth/sign-in?callbackUrl=/owner");

  const { id } = await params;
  const listing = await prisma.listing.findFirst({
    where: { id, ownerUserId: user.id, dataSource: "fsbo" },
  });
  if (!listing) notFound();

  const [views, leads, appointments] = await Promise.all([
    prisma.listingView.count({ where: { mlsNumber: listing.mlsNumber } }),
    prisma.lead.findMany({
      where: { listingMls: listing.mlsNumber },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.appointment.findMany({
      where: { listingMls: listing.mlsNumber },
      orderBy: { startsAt: "desc" },
      take: 20,
      include: {
        customer: { select: { name: true, email: true, phone: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/owner" className="text-sm font-semibold text-canopy">
            ← My listings
          </Link>
          <h1 className="mt-3 font-display text-4xl text-ink">
            {listing.addressLine}
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            {formatListPrice(listing.listPrice, listing.transactionType)} ·{" "}
            {listing.ownerStatus}
          </p>
        </div>
        <OwnerListingActions
          listingId={listing.id}
          ownerStatus={listing.ownerStatus}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-xs uppercase tracking-wide text-ink/45">Views</p>
          <p className="mt-1 font-display text-3xl text-canopy">{views}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-xs uppercase tracking-wide text-ink/45">
            Inquiries
          </p>
          <p className="mt-1 font-display text-3xl text-canopy">{leads.length}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-xs uppercase tracking-wide text-ink/45">
            Viewings
          </p>
          <p className="mt-1 font-display text-3xl text-canopy">
            {appointments.length}
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-ink">Inquiries</h2>
        {leads.length === 0 ? (
          <p className="text-sm text-ink/55">No inquiries yet.</p>
        ) : (
          <ul className="space-y-2">
            {leads.map((lead) => (
              <li
                key={lead.id}
                className="rounded-xl border border-line bg-surface px-4 py-3 text-sm"
              >
                <span className="font-semibold">{lead.source}</span> ·{" "}
                {lead.status} · score {lead.score}
                {lead.notes ? (
                  <p className="mt-1 text-ink/65">{lead.notes}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl text-ink">Viewings</h2>
        {appointments.length === 0 ? (
          <p className="text-sm text-ink/55">
            No viewing appointments yet. Buyers can request showings from the
            public listing page once live.
          </p>
        ) : (
          <ul className="space-y-2">
            {appointments.map((appt) => (
              <li
                key={appt.id}
                className="rounded-xl border border-line bg-surface px-4 py-3 text-sm"
              >
                {appt.startsAt
                  ? appt.startsAt.toLocaleString("en-CA")
                  : "Time TBD"}{" "}
                · {appt.type} · {appt.status}
                <p className="text-ink/65">
                  {appt.customer?.name ?? "Guest"} · {appt.customer?.email}
                  {appt.customer?.phone ? ` · ${appt.customer.phone}` : ""}
                </p>
                <OwnerAppointmentActions
                  appointmentId={appt.id}
                  status={appt.status}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
