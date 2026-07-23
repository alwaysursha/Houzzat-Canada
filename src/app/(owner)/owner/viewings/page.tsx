import Link from "next/link";
import { redirect } from "next/navigation";
import { OwnerAppointmentActions } from "@/components/owner/OwnerAppointmentActions";
import { requireOwnerUser } from "@/lib/owner/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Owner viewings" };

export default async function OwnerViewingsPage() {
  const user = await requireOwnerUser();
  if (!user) redirect("/auth/sign-in?callbackUrl=/owner/viewings");

  const listings = await prisma.listing.findMany({
    where: { ownerUserId: user.id, dataSource: "fsbo" },
    select: { mlsNumber: true, addressLine: true, id: true },
  });
  const mls = listings.map((l) => l.mlsNumber);
  const byMls = new Map(listings.map((l) => [l.mlsNumber, l]));

  const appointments =
    mls.length === 0
      ? []
      : await prisma.appointment.findMany({
          where: { listingMls: { in: mls } },
          orderBy: { startsAt: "desc" },
          take: 50,
          include: {
            customer: { select: { name: true, email: true, phone: true } },
          },
        });

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl text-ink">Viewings</h1>
      <ul className="space-y-2">
        {appointments.map((appt) => {
          const listing = appt.listingMls
            ? byMls.get(appt.listingMls)
            : undefined;
          return (
            <li
              key={appt.id}
              className="rounded-xl border border-line bg-surface px-4 py-3 text-sm"
            >
              <p className="font-semibold">
                {listing?.addressLine ?? appt.listingMls ?? "Listing"}
              </p>
              <p className="text-ink/60">
                {appt.startsAt
                  ? appt.startsAt.toLocaleString("en-CA")
                  : "Time TBD"}{" "}
                · {appt.type} · {appt.status}
              </p>
              <p className="text-ink/65">
                {appt.customer?.name ?? "Guest"} · {appt.customer?.email}
                {appt.customer?.phone ? ` · ${appt.customer.phone}` : ""}
              </p>
              <OwnerAppointmentActions
                appointmentId={appt.id}
                status={appt.status}
              />
              {listing ? (
                <Link
                  href={`/owner/listings/${listing.id}`}
                  className="mt-2 inline-block text-canopy"
                >
                  Open listing
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
      {appointments.length === 0 ? (
        <p className="text-sm text-ink/55">
          No viewing appointments yet. Requests appear here once buyers book
          from your live listing.
        </p>
      ) : null}
    </div>
  );
}
