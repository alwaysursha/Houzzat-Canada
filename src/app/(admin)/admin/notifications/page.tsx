import { redirect } from "next/navigation";
import { StaffNotificationPreferencesForm } from "@/components/notifications/StaffNotificationPreferencesForm";
import { requireAgentContext } from "@/lib/agent";
import { staffSignInRedirectUrl } from "@/lib/auth/staff-sign-in-redirect";
import { staffCategoriesForUi } from "@/lib/notifications/staff-categories";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Notifications · Admin HQ" };

export default async function AdminNotificationsPage() {
  const ctx = await requireAgentContext();
  if (!ctx) redirect(await staffSignInRedirectUrl("/admin/notifications"));

  const user = await prisma.user.findUnique({
    where: { id: ctx.user.id },
    select: { pushNotificationPrefs: true },
  });

  const categories = staffCategoriesForUi(user?.pushNotificationPrefs);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-ink">
          Notifications
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink/60">
          Choose push and email alerts for your HouzzatPro desk. Push and email
          are independent — turning one off does not change the other.
        </p>
      </div>
      <StaffNotificationPreferencesForm
        categories={categories}
        intro="Push alerts appear on the HouzzatPro app when this device is registered. Email alerts use your staff account email."
      />
    </div>
  );
}
