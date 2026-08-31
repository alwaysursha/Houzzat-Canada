/**
 * Stage 4.0 — HouzzatPRO Mobile v2 Authentication & Session Types.
 */

import type { MobileWorkspaceMembership, MobileWorkspace } from "./workspace";

export interface MobileUser {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}

export interface MobileAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Unix epoch ms
}

export interface MobileAuthSession {
  user: MobileUser;
  tokens: MobileAuthTokens;
}

export type MobileNavigationState =
  | "BOOTING"
  | "SIGNED_OUT"
  | "PLATFORM_AUTHENTICATED"
  | "WORKSPACE_SELECTION"
  | "WORKSPACE_ACTIVE";

export interface MobileAuthState {
  state: MobileNavigationState;
  user: MobileUser | null;
  tokens: MobileAuthTokens | null;
  memberships: MobileWorkspaceMembership[];
  activeMembership: MobileWorkspaceMembership | null;
  activeWorkspace: MobileWorkspace | null;
  error: string | null;
  isLoading: boolean;
}
