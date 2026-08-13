import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AgentShell } from "@/components/agent/AgentShell";
import { TeamLeaderDeskBanner } from "@/components/agent/TeamLeaderDeskBanner";
import { requireAgentContext } from "@/lib/agent";
import { DESK_AGENT_COOKIE, resolveDeskView } from "@/lib/agent/brokerage";

export const dynamic = "force-dynamic";

export default async function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const deskCookie =
    (await cookies()).get(DESK_AGENT_COOKIE)?.value ?? null;

  const ctx = await requireAgentContext();
  if (!ctx) {
    redirect("/auth/sign-in?callbackUrl=/agent");
  }

  const desk = await resolveDeskView({ ...ctx, deskCookie });
  const showLeaderBanner = ctx.isPlatformAdmin;

  return (
    <AgentShell
      email={ctx.user.email}
      orgName={ctx.organizationName}
      membershipRole={ctx.membershipRole}
    >
      {showLeaderBanner ? (
        <TeamLeaderDeskBanner deskLabel={desk.deskLabel} />
      ) : null}
      {children}
    </AgentShell>
  );
}
