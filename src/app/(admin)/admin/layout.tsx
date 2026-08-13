import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { auth } from "@/lib/auth";
import {
  DESK_AGENT_COOKIE,
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

  const deskCookie =
    (await cookies()).get(DESK_AGENT_COOKIE)?.value ?? null;

  let fieldAgents: { id: string; name: string | null; email: string }[] = [];
  let deskAgentId: string | null = null;
  try {
    const brokerage = await ensureBrokerageOrganization();
    const teamAgents = await listTeamAgents(brokerage.id);
    fieldAgents = teamAgents.filter((a) => a.role === "AGENT");
    const desk = await resolveDeskView({
      user: { id: session.user.id ?? "" },
      organizationId: brokerage.id,
      canSeeTeamLeads: true,
      deskCookie,
    });
    deskAgentId = desk.deskAgentId;
  } catch (error) {
    console.error("[admin] layout chrome failed", error);
  }

  return (
    <AdminShell
      email={session.user.email ?? "admin"}
      deskAgents={fieldAgents}
      deskAgentId={deskAgentId}
    >
      {children}
    </AdminShell>
  );
}
