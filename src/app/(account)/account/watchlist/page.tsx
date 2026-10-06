import { redirect } from "next/navigation";
import { MonitorsClient } from "@/components/account/MonitorsClient";
import { requireCustomerUser } from "@/lib/account";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Watchlist" };

export default async function AccountWatchlistPage() {
  const user = await requireCustomerUser();
  if (!user) redirect("/auth/sign-in?callbackUrl=/account/watchlist");

  const [propertyMonitors, areaMonitors, alerts] = await Promise.all([
    prisma.propertyMonitor.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.areaMonitor.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.customerAlert.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-ink">Watchlist</h1>
        <p className="mt-2 text-sm text-ink/60">
          Price and status watches for homes, plus new and sold alerts for
          areas you care about — including FSBO / FLBO.
        </p>
      </div>
      <MonitorsClient
        propertyMonitors={propertyMonitors}
        areaMonitors={areaMonitors}
        globalEmailPaused={!user.emailAlertsEnabled}
        alerts={alerts.map((a) => ({
          ...a,
          createdAt: a.createdAt.toISOString(),
          readAt: a.readAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
