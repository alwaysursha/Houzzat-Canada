/**
 * Stage 4.1 — HouzzatPRO Mobile v2 React Auth & Workspace Context.
 */

import React, { createContext, useContext, useEffect, useState } from "react";
import { mobileAuthController, MobileAuthController } from "./auth-controller";
import type { MobileAuthState, MobileNavigationState, MobileUser } from "../types/auth";
import type { MobileWorkspace, MobileWorkspaceMembership } from "../types/workspace";

interface AuthContextValue extends MobileAuthState {
  controller: MobileAuthController;
  login: (credentials: { email: string; password: string }) => Promise<{ ok: boolean; error?: string }>;
  selectWorkspace: (workspaceId: string) => Promise<boolean>;
  changeWorkspace: () => Promise<void>;
  signOut: () => Promise<void>;
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

  const value: AuthContextValue = {
    ...state,
    controller: mobileAuthController,
    login: (credentials) => mobileAuthController.login(credentials),
    selectWorkspace: (wsId: string) => mobileAuthController.selectWorkspace(wsId),
    changeWorkspace: () => mobileAuthController.changeWorkspace(),
    signOut: () => mobileAuthController.signOut(),
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
