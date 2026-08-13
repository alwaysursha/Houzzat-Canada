import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AgentDeferredLeaderBanner } from "@/components/agent/AgentDeferredLeaderBanner";
import { AgentShell } from "@/components/agent/AgentShell";
import { requireAgentGate } from "@/lib/agent";
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
    redirect("/auth/sign-in?callbackUrl=/agent");
  }

  return (
    <AgentShell
      email={gate.user.email}
      orgName={`${SITE_NAME} Team`}
      membershipRole={gate.isPlatformAdmin ? "OWNER" : "AGENT"}
    >
      {gate.isPlatformAdmin ? <AgentDeferredLeaderBanner /> : null}
      <Suspense fallback={null}>{children}</Suspense>
    </AgentShell>
  );
}
