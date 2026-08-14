import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AdminDeferredDeskPicker } from "@/components/admin/AdminDeferredDeskPicker";
import { AdminShell } from "@/components/admin/AdminShell";
import { StaffRouteConsumerGate } from "@/components/mobile/StaffRouteConsumerGate";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Security only — paint shell before brokerage / desk / team queries.
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/sign-in?callbackUrl=/admin");
  }
  if (session.user.role !== "ADMIN") {
    redirect(session.user.role === "AGENT" ? "/agent" : "/account");
  }

  const userId = session.user.id ?? "";

  return (
    <AdminShell
      email={session.user.email ?? "admin"}
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
