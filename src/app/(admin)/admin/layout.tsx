import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { auth } from "@/lib/auth";
import {
  ensureBrokerageOrganization,
  listTeamAgents,
  resolveDeskView,
} from "@/lib/agent/brokerage";

export const dynamic = "force-dynamic";

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

  const brokerage = await ensureBrokerageOrganization();
  const teamAgents = await listTeamAgents(brokerage.id);
  const fieldAgents = teamAgents.filter((a) => a.role === "AGENT");
  const desk = await resolveDeskView({
    user: { id: session.user.id ?? "" },
    organizationId: brokerage.id,
    canSeeTeamLeads: true,
  });

  return (
    <AdminShell
      email={session.user.email ?? "admin"}
      deskAgents={fieldAgents}
      deskAgentId={desk.deskAgentId}
    >
      {children}
    </AdminShell>
  );
}
