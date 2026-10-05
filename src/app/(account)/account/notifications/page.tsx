import Link from "next/link";
import { redirect } from "next/navigation";
import { NotificationPreferencesForm } from "@/components/notifications/NotificationPreferencesForm";
import { requireCustomerUser } from "@/lib/account";
import { catalogForAudience, isPushTypeEnabled } from "@/lib/notifications/catalog";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Notifications" };

/**
 * Push-focused account page. Email preferences live on
 * `/preferences/email` (Communication Preferences).
 */
export default async function AccountNotificationsPage() {
  const customer = await requireCustomerUser();
  if (!customer) redirect("/auth/sign-in?callbackUrl=/account/notifications");

  const user = await prisma.user.findUnique({
    where: { id: customer.id },
    select: { pushNotificationPrefs: true },
  });

  const items = catalogForAudience("consumer").map((item) => ({
    ...item,
    enabled: isPushTypeEnabled(user?.pushNotificationPrefs, item.id),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-ink">
          Notifications
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink/60">
          Choose which Houzzat alerts reach your phone. Email categories and
          unsubscribe controls are in{" "}
          <Link
            href="/preferences/email"
            className="font-semibold text-canopy hover:underline"
          >
            Communication Preferences
          </Link>
          .
        </p>
      </div>
      <NotificationPreferencesForm
        items={items}
        showDeviceActions
        intro="Push alerts for your home search. Manage email preferences separately in Communication Preferences."
      />
    </div>
  );
}
