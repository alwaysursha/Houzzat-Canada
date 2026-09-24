/**
 * Stage 4.0 — HouzzatPRO Mobile v2 Authentication & Session Types.
 */

import type { MobileWorkspaceMembership, MobileWorkspace } from "./workspace";

export interface MobileUser {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  /** Home workspace from tenant login (null for PlatformOperator). */
  workspaceId?: string | null;
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

/** Pre-auth discover choice (password already verified server-side). */
export interface MobileIdentityChoice {
  workspaceId: string;
  displayName: string;
  slug: string;
  role: string;
}

export type MobileNavigationState =
  | "BOOTING"
  | "BOOTSTRAP_RETRY"
  | "SIGNED_OUT"
  | "PLATFORM_AUTHENTICATED"
  | "IDENTITY_SELECTION"
  | "WORKSPACE_SELECTION"
  | "WORKSPACE_ACTIVE";

export interface MobileAuthState {
  state: MobileNavigationState;
  user: MobileUser | null;
  tokens: MobileAuthTokens | null;
  memberships: MobileWorkspaceMembership[];
  /** Pre-login multi-workspace choices from /auth/discover. */
  identityChoices: MobileIdentityChoice[];
  activeMembership: MobileWorkspaceMembership | null;
  activeWorkspace: MobileWorkspace | null;
  error: string | null;
  isLoading: boolean;
}
