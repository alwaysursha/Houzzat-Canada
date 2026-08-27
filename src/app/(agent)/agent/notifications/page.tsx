import { redirect } from "next/navigation";
import { StaffNotificationPreferencesForm } from "@/components/notifications/StaffNotificationPreferencesForm";
import { requireAgentContext } from "@/lib/agent";
import { staffSignInRedirectUrl } from "@/lib/auth/staff-sign-in-redirect";
import { staffCategoriesForUi } from "@/lib/notifications/staff-categories";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Notifications · CRM" };

export default async function AgentNotificationsPage() {
  const ctx = await requireAgentContext();
  if (!ctx) redirect(await staffSignInRedirectUrl("/agent/notifications"));

  const user = await prisma.user.findUnique({
    where: { id: ctx.user.id },
    select: { pushNotificationPrefs: true },
  });

  const categories = staffCategoriesForUi(user?.pushNotificationPrefs);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-[#1e2a38]">
          Notifications
        </h1>
        <p className="mt-1 max-w-xl text-sm text-[#64748b]">
          Choose push and email alerts for your HouzzatPRO desk. Push and email
          are independent — turning one off does not change the other.
        </p>
      </div>
      <StaffNotificationPreferencesForm
        categories={categories}
        intro="Push alerts appear on the HouzzatPRO app when this device is registered. Email alerts use your staff account email."
      />
    </div>
  );
}
