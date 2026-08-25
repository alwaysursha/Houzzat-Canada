/**
 * Stage 3H — feature flags for workspace-scoped control plane.
 * Defaults preserve legacy Houzzat behavior (unset → legacy).
 */
export type WorkspaceScopeMode = "legacy" | "workspace";

function parseScopeFlag(
  envKey: string,
  fallback: WorkspaceScopeMode = "legacy",
): WorkspaceScopeMode {
  const flag = process.env[envKey]?.trim().toLowerCase();
  if (flag === "workspace") return "workspace";
  if (flag === "legacy") return "legacy";
  return fallback;
}

export function parseWorkspaceRoutingScope(): WorkspaceScopeMode {
  return parseScopeFlag("WORKSPACE_ROUTING_SCOPE");
}

export function parseWorkspaceNotificationScope(): WorkspaceScopeMode {
  return parseScopeFlag("WORKSPACE_NOTIFICATION_SCOPE");
}

export function parseWorkspaceTeamScope(): WorkspaceScopeMode {
  return parseScopeFlag("WORKSPACE_TEAM_SCOPE");
}

export function isWorkspaceRoutingScope(): boolean {
  return parseWorkspaceRoutingScope() === "workspace";
}

export function isWorkspaceNotificationScope(): boolean {
  return parseWorkspaceNotificationScope() === "workspace";
}

export function isWorkspaceTeamScope(): boolean {
  return parseWorkspaceTeamScope() === "workspace";
}
