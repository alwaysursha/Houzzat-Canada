import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AdminDeferredDeskPicker } from "@/components/admin/AdminDeferredDeskPicker";
import { AdminShell } from "@/components/admin/AdminShell";
import { StaffRouteConsumerGate } from "@/components/mobile/StaffRouteConsumerGate";
import { auth } from "@/lib/auth";
import {
  redirectNonAdminFromAdminShell,
  staffSignInRedirectUrl,
} from "@/lib/auth/staff-sign-in-redirect";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Security only — paint shell before brokerage / desk / team queries.
  const session = await auth();
  if (!session?.user) {
    redirect(await staffSignInRedirectUrl("/admin"));
  }
  const user = session!.user;
  if (user.role !== "ADMIN") {
    await redirectNonAdminFromAdminShell(user.role);
  }

  const userId = user.id ?? "";

  return (
    <AdminShell
      email={user.email ?? "admin"}
      deskSlot={
        userId ? <AdminDeferredDeskPicker userId={userId} /> : null
      }
      deskSlotCompact={
        userId ? (
          <AdminDeferredDeskPicker userId={userId} compact />
        ) : null
      }
      mobileDeskSlot={
        userId ? <AdminDeferredDeskPicker userId={userId} /> : null
      }
    >
      <StaffRouteConsumerGate />
      <Suspense fallback={null}>{children}</Suspense>
    </AdminShell>
  );
}
