import { redirect } from "next/navigation";
import { readActiveWorkspaceIdFromCookies } from "@/lib/active-workspace";
import { requireAgentUser } from "@/lib/agent";
import { listActiveWorkspaceMemberships } from "@/lib/workspace-context";

/**
 * Redirects multi-membership staff to workspace chooser when no valid selection.
 * Single-membership users pass through unchanged.
 */
export async function ensureActiveWorkspaceSelected(): Promise<void> {
  const user = await requireAgentUser();
  if (!user) return;

  const memberships = await listActiveWorkspaceMemberships(user.id);
  if (memberships.length <= 1) return;

  const activeWorkspaceId = await readActiveWorkspaceIdFromCookies();
  const valid =
    activeWorkspaceId &&
    memberships.some(
      (m) =>
        m.workspaceId === activeWorkspaceId && m.workspace.status === "ACTIVE",
    );
  if (!valid) {
    redirect("/agent/workspace");
  }
}
