/**
 * Phase 1 — AppRoot hosts existing role shells without migrating their internals.
 *
 * Role selection remains driven by auth-controller membership (WorkspaceMember.role).
 * Navigation is never authority for workspace or role.
 */

import React from "react";
import { AccessUnavailableScreen } from "../screens/AccessUnavailableScreen";
import { AgentShell } from "../screens/AgentShell";
import { CommandCentreShell } from "../screens/CommandCentreShell";
import { useAuth } from "../state/AuthContext";

export function AppRoot() {
  const { activeMembership } = useAuth();
  const role = activeMembership?.role;

  if (role === "AGENT" || (role as string) === "MEMBER") {
    return <AgentShell />;
  }
  if (role === "OWNER" || role === "ADMIN") {
    return <CommandCentreShell />;
  }
  return <AccessUnavailableScreen />;
}
