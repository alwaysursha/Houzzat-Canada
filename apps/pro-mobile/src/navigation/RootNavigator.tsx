/**
 * Phase 1 — React Navigation root stack foundation.
 *
 * Auth-controller state remains authoritative. This navigator mirrors that state
 * into proper routes; it does not decide workspace, role, or tenancy.
 *
 * WORKSPACE_ACTIVE → AppRoot (hosts existing AgentShell / CommandCentreShell
 * unchanged). Shell-internal tabs, leads, chats, and custom Back are not migrated.
 */

import React, { useState } from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SignInScreen } from "../screens/SignInScreen";
import { SplashScreen } from "../screens/SplashScreen";
import { WorkspaceSelectionScreen } from "../screens/WorkspaceSelectionScreen";
import { useAuth } from "../state/AuthContext";
import { AppRoot } from "./AppRoot";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

function BootstrapRetryScreen() {
  const { error, retryBootstrap, isLoading } = useAuth();
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

  return (
    <SplashScreen
      error={error ?? "Couldn't reach HouzzatPRO. Try again."}
      onRetry={() => void onRetryBootstrap()}
      retrying={retrying || isLoading}
    />
  );
}

export function RootNavigator() {
  const { state } = useAuth();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: "fade",
        gestureEnabled: false,
      }}
    >
      {state === "BOOTING" ? (
        <Stack.Screen name="Splash" component={SplashScreen} />
      ) : state === "BOOTSTRAP_RETRY" ? (
        <Stack.Screen name="BootstrapRetry" component={BootstrapRetryScreen} />
      ) : state === "SIGNED_OUT" ? (
        <Stack.Screen name="SignIn" component={SignInScreen} />
      ) : state === "PLATFORM_AUTHENTICATED" ||
        state === "IDENTITY_SELECTION" ||
        state === "WORKSPACE_SELECTION" ? (
        <Stack.Screen
          name="WorkspaceSelection"
          component={WorkspaceSelectionScreen}
        />
      ) : state === "WORKSPACE_ACTIVE" ? (
        <Stack.Screen name="AppRoot" component={AppRoot} />
      ) : (
        <Stack.Screen name="Splash" component={SplashScreen} />
      )}
    </Stack.Navigator>
  );
}
