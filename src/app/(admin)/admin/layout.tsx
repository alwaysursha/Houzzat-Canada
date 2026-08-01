import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { auth } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/sign-in?callbackUrl=/admin");
  }
  if (session.user.role !== "ADMIN") {
    redirect(session.user.role === "AGENT" ? "/agent" : "/account");
  }

  return (
    <AdminShell email={session.user.email ?? "admin"}>
      {children}
    </AdminShell>
  );
}
