import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ActiveWorkspaceGate } from "@/components/agent/ActiveWorkspaceGate";
import { AgentDeferredLeaderBanner } from "@/components/agent/AgentDeferredLeaderBanner";
import { AgentShell } from "@/components/agent/AgentShell";
import { StaffRouteConsumerGate } from "@/components/mobile/StaffRouteConsumerGate";
import { requireAgentGate } from "@/lib/agent";
import { staffSignInRedirectUrl } from "@/lib/auth/staff-sign-in-redirect";
import { SITE_NAME } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Security only — shell paints before brokerage / desk resolution.
  const gate = await requireAgentGate();
  if (!gate) {
    redirect(await staffSignInRedirectUrl("/agent"));
  }
  const agentGate = gate!;

  return (
    <AgentShell
      email={agentGate.user.email}
      orgName={`${SITE_NAME} Team`}
      membershipRole={agentGate.isPlatformAdmin ? "OWNER" : "AGENT"}
    >
      <ActiveWorkspaceGate />
      <StaffRouteConsumerGate />
      {agentGate.isPlatformAdmin ? <AgentDeferredLeaderBanner /> : null}
      <Suspense fallback={null}>{children}</Suspense>
    </AgentShell>
  );
}
