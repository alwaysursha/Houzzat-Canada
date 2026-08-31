/**
 * Stage 4.0 — HouzzatPRO Mobile v2 Root Navigator.
 *
 * Implements native state-driven screen transitions:
 * BOOTING -> SIGNED_OUT (Welcome/SignIn) -> WORKSPACE_SELECTION -> WORKSPACE_ACTIVE (AppReady)
 */

import React, { useState } from "react";
import { View } from "react-native";
import { AppReadyScreen } from "../screens/AppReadyScreen";
import { SignInScreen } from "../screens/SignInScreen";
import { SplashScreen } from "../screens/SplashScreen";
import { WelcomeScreen } from "../screens/WelcomeScreen";
import { WorkspaceSelectionScreen } from "../screens/WorkspaceSelectionScreen";
import { useAuth } from "../state/AuthContext";

export function RootNavigator() {
  const { state } = useAuth();
  const [inSignInFlow, setInSignInFlow] = useState(false);

  switch (state) {
    case "BOOTING":
      return <SplashScreen />;

    case "SIGNED_OUT":
      if (inSignInFlow) {
        return <SignInScreen onBack={() => setInSignInFlow(false)} />;
      }
      return <WelcomeScreen onStartSignIn={() => setInSignInFlow(true)} />;

    case "PLATFORM_AUTHENTICATED":
    case "WORKSPACE_SELECTION":
      return <WorkspaceSelectionScreen />;

    case "WORKSPACE_ACTIVE":
      return <AppReadyScreen />;

    default:
      return <SplashScreen />;
  }
}
