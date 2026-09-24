/**
 * Stage 4.1 — HouzzatPRO Mobile v2 React Auth & Workspace Context.
 */

import React, { createContext, useContext, useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { mobileAuthController, MobileAuthController } from "./auth-controller";
import type { MobileAuthState } from "../types/auth";
import type { MobileWorkspace, MobileWorkspaceMembership } from "../types/workspace";

interface AuthContextValue extends MobileAuthState {
  controller: MobileAuthController;
  login: (credentials: {
    email: string;
    password: string;
    mode?: "platform" | "tenant";
    workspaceId?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  selectIdentity: (workspaceId: string) => Promise<{ ok: boolean; error?: string }>;
  selectWorkspace: (workspaceId: string) => Promise<boolean>;
  changeWorkspace: () => Promise<void>;
  cancelIdentitySelection: () => Promise<void>;
  signOut: () => Promise<void>;
  retryBootstrap: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<MobileAuthState>(() => mobileAuthController.getSnapshot());

  useEffect(() => {
    const unsubscribe = mobileAuthController.subscribe((next) => {
      setState(next);
    });
    void mobileAuthController.bootstrap();
    return unsubscribe;
  }, []);

  // WhatsApp-style keep-alive: when the agent returns to the app after idle,
  // silently refresh before the next Leads/detail request can fail.
  useEffect(() => {
    let last: AppStateStatus = AppState.currentState;
    const onChange = (next: AppStateStatus) => {
      if (last.match(/inactive|background/) && next === "active") {
        void mobileAuthController.onAppForeground();
      }
      last = next;
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => {
      sub.remove();
    };
  }, []);

  const value: AuthContextValue = {
    ...state,
    controller: mobileAuthController,
    login: (credentials) => mobileAuthController.login(credentials),
    selectIdentity: (wsId) => mobileAuthController.selectIdentity(wsId),
    selectWorkspace: (wsId: string) => mobileAuthController.selectWorkspace(wsId),
    changeWorkspace: () => mobileAuthController.changeWorkspace(),
    cancelIdentitySelection: () => mobileAuthController.cancelIdentitySelection(),
    signOut: () => mobileAuthController.signOut(),
    retryBootstrap: () => mobileAuthController.retryBootstrap(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

export function useActiveWorkspace(): {
  workspace: MobileWorkspace | null;
  membership: MobileWorkspaceMembership | null;
  role: MobileWorkspaceMembership["role"] | null;
} {
  const { activeWorkspace, activeMembership } = useAuth();
  return {
    workspace: activeWorkspace,
    membership: activeMembership,
    role: activeMembership?.role ?? null,
  };
}
