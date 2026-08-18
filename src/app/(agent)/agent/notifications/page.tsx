import { NotificationPreferencesForm } from "@/components/notifications/NotificationPreferencesForm";
import { requireAgentContext } from "@/lib/agent";
import { catalogForAudience, isPushTypeEnabled } from "@/lib/notifications/catalog";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const metadata = { title: "Notifications · CRM" };

export default async function AgentNotificationsPage() {
  const ctx = await requireAgentContext();
  if (!ctx) redirect("/auth/sign-in?callbackUrl=/agent/notifications");

  const user = await prisma.user.findUnique({
    where: { id: ctx.user.id },
    select: { pushNotificationPrefs: true },
  });

  const items = catalogForAudience("staff").map((item) => ({
    ...item,
    enabled: isPushTypeEnabled(user?.pushNotificationPrefs, item.id),
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-[#1e2a38]">
          Notifications
        </h1>
        <p className="mt-1 max-w-xl text-sm text-[#64748b]">
          HouzzatPro lock-screen alerts. All types start on — uncheck what you
          don’t want.
        </p>
      </div>
      <NotificationPreferencesForm
        items={items}
        intro="These only fire on the HouzzatPro app when push is set up on this device."
      />
    </div>
  );
}
