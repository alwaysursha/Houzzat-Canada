import { notFound, redirect } from "next/navigation";
import { AgentProfileAdminClient } from "@/components/agent/AgentProfileAdminClient";
import { loadWorkspaceAgentProfile } from "@/lib/agent/admin-managed-profile";
import { requireAgentPageContext } from "@/lib/agent/agent-context-request";
import { resolveTeamAuthority } from "@/lib/workspace-team";

export const metadata = { title: "Agent profile · Team" };

export default async function AgentTeamProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const ctx = await requireAgentPageContext(`/agent/team/${userId}`);
  const authority = resolveTeamAuthority(ctx);
  if (authority.mode === "unavailable") {
    redirect("/agent/workspace");
  }
  if (authority.mode !== "workspace") {
    redirect("/agent/team");
  }

  const result = await loadWorkspaceAgentProfile(ctx, userId);
  if (!result.ok) notFound();

  return <AgentProfileAdminClient profile={result.profile} />;
}
