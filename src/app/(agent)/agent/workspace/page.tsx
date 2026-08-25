import { redirect } from "next/navigation";
import { WorkspaceChooserClient } from "@/components/agent/WorkspaceChooserClient";
import { readActiveWorkspaceIdFromCookies } from "@/lib/active-workspace";
import { requireAgentUser } from "@/lib/agent";
import { listActiveWorkspaceMemberships } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

export default async function WorkspaceChooserPage() {
  const user = await requireAgentUser();
  if (!user) {
    redirect("/pro/sign-in");
  }

  const memberships = await listActiveWorkspaceMemberships(user.id);
  if (memberships.length <= 1) {
    redirect("/agent");
  }

  const activeWorkspaceId = await readActiveWorkspaceIdFromCookies();
  const hasValidSelection =
    activeWorkspaceId &&
    memberships.some(
      (m) =>
        m.workspaceId === activeWorkspaceId && m.workspace.status === "ACTIVE",
    );
  if (hasValidSelection) {
    redirect("/agent");
  }

  return (
    <WorkspaceChooserClient
      currentWorkspaceId={activeWorkspaceId}
      memberships={memberships.map((m) => ({
        workspaceId: m.workspaceId,
        name: m.workspace.name,
        brokerageAffiliation: m.workspace.brokerageAffiliation,
        role: m.role,
      }))}
    />
  );
}
