import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountProfileHeader } from "@/components/account/AccountProfileHeader";
import { AlertPreferencesForm } from "@/components/account/AlertPreferencesForm";
import { BiometricsAccountToggle } from "@/components/account/BiometricsAccountToggle";
import { VowAcceptCard } from "@/components/account/VowAcceptCard";
import {
  customerWorkspaceAppointmentWhere,
  customerWorkspaceLeadWhere,
  resolveAccountWorkspaceId,
} from "@/lib/account/customer-workspace-scope";
import { requireCustomerUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { tenantAccountLabel } from "@/lib/tenancy/marketing-presentation-brand";
import { resolveMarketingPresentationBrand } from "@/lib/tenancy/resolve-marketing-tenancy";
import { withStagingSnapshotBoundary } from "@/lib/tenancy/templates/high-octane-staging-snapshot";
import { stagingSnapshotVisibleForServerPage } from "@/lib/tenancy/templates/high-octane-staging-snapshot-request";
import { hasVowAccess } from "@/lib/vow";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await resolveMarketingPresentationBrand();
  return { title: brand ? tenantAccountLabel(brand) : "Your account" };
}

type AccountStats = {
  savedCount: number;
  searchCount: number;
  noteCount: number;
  propertyWatchCount: number;
  areaWatchCount: number;
  alertCount: number;
  leadCount: number;
  appointmentCount: number;
  viewCount: number;
  recentNotes: Array<{
    id: string;
    mlsNumber: string;
    body: string;
    updatedAt: Date;
  }>;
  loadError: boolean;
};

async function loadAccountStats(
  userId: string,
  workspaceId: string | null,
): Promise<AccountStats> {
  try {
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
      prisma.savedListing.count({ where: { userId } }),
      prisma.savedSearch.count({ where: { userId } }),
      prisma.listingNote.count({ where: { userId } }),
      prisma.propertyMonitor.count({ where: { userId } }),
      prisma.areaMonitor.count({ where: { userId } }),
      prisma.customerAlert.count({ where: { userId, readAt: null } }),
      workspaceId
        ? prisma.lead.count({
            where: customerWorkspaceLeadWhere(userId, workspaceId),
          })
        : Promise.resolve(0),
      workspaceId
        ? prisma.appointment.count({
            where: customerWorkspaceAppointmentWhere(userId, workspaceId),
          })
        : Promise.resolve(0),
      prisma.listingView.count({ where: { userId } }),
      prisma.listingNote.findMany({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
    ]);

    return {
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
      loadError: false,
    };
  } catch (error) {
    console.error("[account] stats load failed", error);
    return {
      savedCount: 0,
      searchCount: 0,
      noteCount: 0,
      propertyWatchCount: 0,
      areaWatchCount: 0,
      alertCount: 0,
      leadCount: 0,
      appointmentCount: 0,
      viewCount: 0,
      recentNotes: [],
      loadError: true,
    };
  }
}

export default async function AccountPage() {
  const brand = await resolveMarketingPresentationBrand();
  const brandName = brand?.displayName?.trim() || "this site";
  const user = await requireCustomerUser();
  if (!user) {
    redirect("/auth/sign-in?callbackUrl=/account");
  }

  const workspaceId = await resolveAccountWorkspaceId();
  const stats = await loadAccountStats(user.id, workspaceId);
  const {
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
    loadError,
  } = stats;

  let listingByMls = new Map<
    string,
    {
      mlsNumber: string;
      addressLine: string;
      unitNumber: string | null;
      city: string;
    }
  >();

  if (recentNotes.length > 0) {
    try {
      const noteListings = await prisma.listing.findMany({
        where: withStagingSnapshotBoundary(
          { mlsNumber: { in: recentNotes.map((n) => n.mlsNumber) } },
          await stagingSnapshotVisibleForServerPage(),
        ),
        select: {
          mlsNumber: true,
          addressLine: true,
          unitNumber: true,
          city: true,
        },
      });
      listingByMls = new Map(noteListings.map((l) => [l.mlsNumber, l]));
    } catch (error) {
      console.error("[account] note listings load failed", error);
    }
  }

  const vowOk = hasVowAccess(user);

  let hasPassword = false;
  try {
    const authRow = await prisma.user.findUnique({
      where: { id: user.id },
      select: { password: true },
    });
    hasPassword = Boolean(authRow?.password);
  } catch (error) {
    console.error("[account] password presence check failed", error);
  }

  return (
    <div className="space-y-8">
      <AccountProfileHeader user={user} />

      <BiometricsAccountToggle
        email={user.email}
        hasPassword={hasPassword}
        userId={user.id}
      />

      {loadError ? (
        <div className="rounded-2xl border border-signal/30 bg-signal/5 px-4 py-3 text-sm text-ink">
          Some account numbers couldn’t load just now.{" "}
          <Link href="/account" className="font-semibold text-canopy">
            Refresh
          </Link>{" "}
          to try again — your saved homes are still here.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Link
          href="/account/chat"
          className="rounded-2xl border border-line bg-surface p-5 transition hover:border-canopy/40"
        >
          <h2 className="font-semibold text-ink">Chat</h2>
          <p className="mt-2 text-sm text-ink/55">Message your agent</p>
        </Link>
        {[
          { label: "Saved homes", value: savedCount, href: "/account/saved" },
          { label: "Notes", value: noteCount, href: "/account/notes" },
          {
            label: "Saved searches",
            value: searchCount,
            href: "/account/searches",
          },
          {
            label: "Watchlist",
            value: propertyWatchCount + areaWatchCount,
            href: "/account/watchlist",
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

      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-display text-2xl text-ink">Info</h2>
        <p className="mt-1 text-sm text-ink/55">
          Consent recorded when you created your {brandName} client account.
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-ink/45">Terms accepted at</dt>
            <dd className="mt-0.5 font-medium text-ink">
              {user.termsAcceptedAt
                ? user.termsAcceptedAt.toLocaleString("en-CA")
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-ink/45">PropTx agreement accepted at</dt>
            <dd className="mt-0.5 font-medium text-ink">
              {user.vowAcceptedAt
                ? user.vowAcceptedAt.toLocaleString("en-CA")
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-ink/45">Email &amp; phone consent accepted at</dt>
            <dd className="mt-0.5 font-medium text-ink">
              {user.caslConsentAt
                ? user.caslConsentAt.toLocaleString("en-CA")
                : "—"}
            </dd>
          </div>
        </dl>
      </section>

      {!vowOk ? (
        <VowAcceptCard callbackPath="/account" />
      ) : (
        <div className="rounded-2xl border border-canopy/20 bg-canopy/5 px-4 py-3 text-sm text-canopy-deep">
          Client access active — sold prices and listing history unlocked.
        </div>
      )}

      <AlertPreferencesForm
        smsAlertsEnabled={user.smsAlertsEnabled}
        phone={user.phone}
      />
    </div>
  );
}
