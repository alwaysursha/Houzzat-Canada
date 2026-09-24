/**
 * Stage 4.2 — HouzzatPRO Mobile v2 Root Navigator.
 *
 * Implements native state-driven & role-aware screen transitions:
 * - BOOTING -> SplashScreen
 * - BOOTSTRAP_RETRY -> SplashScreen with retry (credentials preserved)
 * - SIGNED_OUT -> WelcomeScreen | SignInScreen
 * - PLATFORM_AUTHENTICATED / WORKSPACE_SELECTION / IDENTITY_SELECTION -> WorkspaceSelectionScreen
 * - WORKSPACE_ACTIVE:
 *     - role === "AGENT" (or "MEMBER") -> AgentShell (Home, Leads, Tasks, More)
 *     - role === "OWNER" | "ADMIN" -> CommandCentreShell (Overview, Team, Leads, More)
 *     - otherwise -> AccessUnavailableScreen
 */

import React, { useState } from "react";
import { AccessUnavailableScreen } from "../screens/AccessUnavailableScreen";
import { AgentShell } from "../screens/AgentShell";
import { CommandCentreShell } from "../screens/CommandCentreShell";
import { SignInScreen } from "../screens/SignInScreen";
import { SplashScreen } from "../screens/SplashScreen";
import { WorkspaceSelectionScreen } from "../screens/WorkspaceSelectionScreen";
import { useAuth } from "../state/AuthContext";

export function RootNavigator() {
  const { state, activeMembership, error, retryBootstrap, isLoading } =
    useAuth();
  const [retrying, setRetrying] = useState(false);

  async function onRetryBootstrap() {
    if (retrying) return;
    setRetrying(true);
    try {
      await retryBootstrap();
    } finally {
      setRetrying(false);
    }
  }

  switch (state) {
    case "BOOTING":
      return <SplashScreen />;

    case "BOOTSTRAP_RETRY":
      return (
        <SplashScreen
          error={error ?? "Couldn't reach HouzzatPRO. Try again."}
          onRetry={() => void onRetryBootstrap()}
          retrying={retrying || isLoading}
        />
      );

    case "SIGNED_OUT":
      return <SignInScreen />;

    case "PLATFORM_AUTHENTICATED":
    case "IDENTITY_SELECTION":
    case "WORKSPACE_SELECTION":
      return <WorkspaceSelectionScreen />;

    case "WORKSPACE_ACTIVE": {
      const role = activeMembership?.role;
      if (role === "AGENT" || (role as string) === "MEMBER") {
        return <AgentShell />;
      }
      if (role === "OWNER" || role === "ADMIN") {
        return <CommandCentreShell />;
      }
      return <AccessUnavailableScreen />;
    }

    default: {
      const _exhaustive: never = state;
      void _exhaustive;
      return <SplashScreen />;
    }
  }
}
