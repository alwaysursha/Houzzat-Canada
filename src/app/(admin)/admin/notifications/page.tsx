import { redirect } from "next/navigation";
import { NotificationPreferencesForm } from "@/components/notifications/NotificationPreferencesForm";
import { requireAgentContext } from "@/lib/agent";
import { catalogForAudience, isPushTypeEnabled } from "@/lib/notifications/catalog";
import { prisma } from "@/lib/prisma";
import { staffSignInRedirectUrl } from "@/lib/auth/staff-sign-in-redirect";

export const metadata = { title: "Notifications · Admin HQ" };

export default async function AdminNotificationsPage() {
  const ctx = await requireAgentContext();
  if (!ctx) redirect(await staffSignInRedirectUrl("/admin/notifications"));

  const user = await prisma.user.findUnique({
    where: { id: ctx.user.id },
    select: { pushNotificationPrefs: true },
  });

  const items = catalogForAudience("staff").map((item) => ({
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
          HouzzatPro lock-screen alerts for your desk. All types start on —
          uncheck what you don’t want.
        </p>
      </div>
      <NotificationPreferencesForm
        items={items}
        intro="These only fire on the HouzzatPro app when push is set up on this device."
      />
    </div>
  );
}
