import { redirect } from "next/navigation";
import { AgentShell } from "@/components/agent/AgentShell";
import { requireAgentContext } from "@/lib/agent";

export default async function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireAgentContext();
  if (!ctx) {
    redirect("/auth/sign-in?callbackUrl=/agent");
  }

  return (
    <AgentShell
      email={ctx.user.email}
      orgName={ctx.organizationName}
      membershipRole={ctx.membershipRole}
    >
      {children}
    </AgentShell>
  );
}
