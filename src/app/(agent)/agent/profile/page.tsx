import { redirect } from "next/navigation";
import { AgentSelfProfileClient } from "@/components/agent/AgentSelfProfileClient";
import { loadWorkspaceAgentProfile } from "@/lib/agent/admin-managed-profile";
import { requireAgentPageContext } from "@/lib/agent/agent-context-request";
import { resolveTeamAuthority } from "@/lib/workspace-team";

export const metadata = { title: "Profile · CRM" };

export default async function AgentProfilePage() {
  const ctx = await requireAgentPageContext("/agent/profile");
  const authority = resolveTeamAuthority(ctx);
  if (authority.mode === "unavailable") {
    redirect("/agent/workspace");
  }
  if (authority.mode !== "workspace" || !ctx.workspaceId) {
    redirect("/agent");
  }

  const result = await loadWorkspaceAgentProfile(ctx, ctx.user.id);
  if (!result.ok) {
    redirect("/agent");
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <AgentSelfProfileClient
        profile={result.profile}
        workspaceId={ctx.workspaceId}
      />
    </div>
  );
}
