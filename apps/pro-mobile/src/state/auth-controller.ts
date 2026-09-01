/**
 * Stage 4.1 — HouzzatPRO Mobile v2 Authentication Controller.
 *
 * Connects to live /api/mobile/v2/ endpoints:
 * - POST /api/mobile/v2/auth/login
 * - GET /api/mobile/v2/workspaces
 * - POST /api/mobile/v2/workspaces/:workspaceId/session
 * - POST /api/mobile/v2/auth/refresh
 * - POST /api/mobile/v2/auth/logout
 *
 * TENANCY GUARANTEE:
 * Mobile tenancy authority is strictly `workspaceId` and WorkspaceMember.role (never hostname).
 */

import { mobileApiClient } from "../api/client";
import {
  clearLeadAppointmentsCache,
  clearLeadConversationsCache,
  clearLeadEngagementCache,
  clearLeadTasksCache,
} from "../lib/lead-tab-cache";
import { SecureStorage, SECURE_STORAGE_KEYS } from "../storage/secure-storage";
import "../storage/hardware-secure-storage"; // initialize hardware engine
import type {
  MobileAuthState,
  MobileAuthTokens,
  MobileNavigationState,
  MobileUser,
} from "../types/auth";
import type { MobileWorkspace, MobileWorkspaceMembership } from "../types/workspace";
import type {
  BackendEnvelope,
  LoginResponseData,
  WorkspacesResponseData,
  WorkspaceSessionResponseData,
  RefreshResponseData,
} from "../types/api";

type StateListener = (state: MobileAuthState) => void;

function unwrapResponse<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== "object") return null;
  if ("data" in payload && (payload as BackendEnvelope<T>).data !== undefined) {
    return (payload as BackendEnvelope<T>).data;
  }
  return payload as T;
}

export class MobileAuthController {
  private state: MobileAuthState = {
    state: "BOOTING",
    user: null,
    tokens: null,
    memberships: [],
    activeMembership: null,
    activeWorkspace: null,
    error: null,
    isLoading: true,
  };

  private listeners = new Set<StateListener>();

  constructor() {
    mobileApiClient.setTokenProvider(async () => this.state.tokens?.accessToken ?? null);
    mobileApiClient.setWorkspaceIdProvider(() => this.state.activeWorkspace?.id ?? null);
  }

  public getSnapshot(): MobileAuthState {
    return { ...this.state };
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private updateState(updates: Partial<MobileAuthState>): void {
    this.state = {
      ...this.state,
      ...updates,
    };
    this.notify();
  }

  /**
   * Cold-start session restore.
   * Checks secure storage -> verifies/refreshes tokens -> re-queries active memberships -> restores WORKSPACE_ACTIVE.
   */
  public async bootstrap(): Promise<void> {
    try {
      this.updateState({ isLoading: true, error: null });

      const rawTokens = await SecureStorage.getItem(SECURE_STORAGE_KEYS.AUTH_TOKENS);
      const rawUser = await SecureStorage.getItem(SECURE_STORAGE_KEYS.USER_PROFILE);
      const savedActiveWsId = await SecureStorage.getItem(SECURE_STORAGE_KEYS.ACTIVE_WORKSPACE_ID);

      if (!rawTokens || !rawUser) {
        this.updateState({
          state: "SIGNED_OUT",
          user: null,
          tokens: null,
          memberships: [],
          activeMembership: null,
          activeWorkspace: null,
          isLoading: false,
        });
        return;
      }

      const tokens = JSON.parse(rawTokens) as MobileAuthTokens;
      const user = JSON.parse(rawUser) as MobileUser;

      // 1. Check if access token needs refresh
      let activeTokens = tokens;
      const isExpired = tokens.expiresAt && Date.now() > tokens.expiresAt;

      if (isExpired && tokens.refreshToken) {
        const refreshRes = await mobileApiClient.post<BackendEnvelope<RefreshResponseData>>(
          "/auth/refresh",
          {
            refreshToken: tokens.refreshToken,
            activeWorkspaceId: savedActiveWsId || undefined,
          },
          { skipAuth: true },
        );

        if (!refreshRes.ok) {
          // Refresh revoked or invalid -> clear credentials and sign out
          await this.signOut();
          return;
        }

        const refreshData = unwrapResponse<RefreshResponseData>(refreshRes.data);
        if (
          !refreshData ||
          !refreshData.tokens ||
          typeof refreshData.tokens.accessToken !== "string" ||
          refreshData.tokens.accessToken.trim().length === 0 ||
          typeof refreshData.tokens.expiresAt !== "number" ||
          !Number.isFinite(refreshData.tokens.expiresAt)
        ) {
          await this.signOut();
          return;
        }

        activeTokens = {
          accessToken: refreshData.tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: refreshData.tokens.expiresAt,
        };
        await SecureStorage.setItem(SECURE_STORAGE_KEYS.AUTH_TOKENS, JSON.stringify(activeTokens));
      }

      this.updateState({
        user,
        tokens: activeTokens,
      });

      // 2. Discover and re-validate active memberships
      const wsRes = await mobileApiClient.get<BackendEnvelope<WorkspacesResponseData>>(
        "/workspaces",
        { token: activeTokens.accessToken },
      );

      if (!wsRes.ok) {
        await this.signOut();
        return;
      }

      const wsData = unwrapResponse<WorkspacesResponseData>(wsRes.data);
      const memberships = wsData?.memberships || [];
      if (memberships.length === 0) {
        this.updateState({
          state: "PLATFORM_AUTHENTICATED",
          memberships: [],
          activeMembership: null,
          activeWorkspace: null,
          isLoading: false,
          error: "No active workspace access found.",
        });
        return;
      }

      // 3. Restore previously active workspace or select if only 1 exists
      const targetWsId = savedActiveWsId || (memberships.length === 1 ? memberships[0]!.workspaceId : null);

      if (targetWsId) {
        const matched = memberships.find((m) => m.workspaceId === targetWsId);
        if (matched) {
          // Activate workspace session via server endpoint
          await this.selectWorkspace(targetWsId, activeTokens.accessToken);
          return;
        }
      }

      // Multiple workspaces exist without selected one -> WORKSPACE_SELECTION
      this.updateState({
        state: "WORKSPACE_SELECTION",
        memberships,
        activeMembership: null,
        activeWorkspace: null,
        isLoading: false,
      });
    } catch {
      await this.signOut();
    }
  }

  /**
   * Mock / Development Authentication helper for testing state machine transitions.
   */
  public async mockAuthenticate(input: {
    user: MobileUser;
    tokens: MobileAuthTokens;
    memberships: MobileWorkspaceMembership[];
  }): Promise<{ ok: boolean; state: MobileNavigationState }> {
    this.updateState({ isLoading: true, error: null });

    try {
      await SecureStorage.setItem(SECURE_STORAGE_KEYS.AUTH_TOKENS, JSON.stringify(input.tokens));
      await SecureStorage.setItem(SECURE_STORAGE_KEYS.USER_PROFILE, JSON.stringify(input.user));

      const activeMemberships = input.memberships.filter((m) => m.status === "ACTIVE");

      if (activeMemberships.length === 0) {
        this.updateState({
          state: "PLATFORM_AUTHENTICATED",
          user: input.user,
          tokens: input.tokens,
          memberships: [],
          activeMembership: null,
          activeWorkspace: null,
          isLoading: false,
          error: "No active workspace access",
        });
        return { ok: true, state: "PLATFORM_AUTHENTICATED" };
      }

      if (activeMemberships.length === 1) {
        const single = activeMemberships[0]!;
        await SecureStorage.setItem(SECURE_STORAGE_KEYS.ACTIVE_WORKSPACE_ID, single.workspaceId);
        this.updateState({
          state: "WORKSPACE_ACTIVE",
          user: input.user,
          tokens: input.tokens,
          memberships: activeMemberships,
          activeMembership: single,
          activeWorkspace: single.workspace,
          isLoading: false,
          error: null,
        });
        return { ok: true, state: "WORKSPACE_ACTIVE" };
      }

      this.updateState({
        state: "WORKSPACE_SELECTION",
        user: input.user,
        tokens: input.tokens,
        memberships: activeMemberships,
        activeMembership: null,
        activeWorkspace: null,
        isLoading: false,
        error: null,
      });
      return { ok: true, state: "WORKSPACE_SELECTION" };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Mock auth failed";
      this.updateState({ isLoading: false, error: msg });
      return { ok: false, state: "SIGNED_OUT" };
    }
  }

  /**
   * Real Native Login against POST /api/mobile/v2/auth/login.
   */
  public async login(credentials: { email: string; password: string }): Promise<{ ok: boolean; error?: string }> {
    this.updateState({ isLoading: true, error: null });

    try {
      const loginRes = await mobileApiClient.post<BackendEnvelope<LoginResponseData>>("/auth/login", {
        email: credentials.email,
        password: credentials.password,
      }, { skipAuth: true });

      if (!loginRes.ok) {
        this.updateState({
          isLoading: false,
          error: loginRes.message || "Invalid email or password",
        });
        return { ok: false, error: loginRes.message };
      }

      // Explicitly unwrap response envelope
      const loginData = unwrapResponse<LoginResponseData>(loginRes.data);

      if (!loginData || !loginData.user || !loginData.tokens) {
        const errorMsg = "Malformed login response from server";
        this.updateState({
          isLoading: false,
          error: errorMsg,
        });
        return { ok: false, error: errorMsg };
      }

      const { user, tokens } = loginData;

      // Defensive validation before persisting or calling native bridge
      if (
        typeof user.id !== "string" || user.id.trim().length === 0 ||
        typeof user.email !== "string" || user.email.trim().length === 0 ||
        typeof tokens.accessToken !== "string" || tokens.accessToken.trim().length === 0 ||
        typeof tokens.refreshToken !== "string" || tokens.refreshToken.trim().length === 0 ||
        typeof tokens.expiresAt !== "number" || !Number.isFinite(tokens.expiresAt) || tokens.expiresAt <= 0
      ) {
        const errorMsg = "Invalid authentication tokens received from server";
        this.updateState({
          isLoading: false,
          error: errorMsg,
        });
        return { ok: false, error: errorMsg };
      }

      // Persist platform auth session
      const serializedTokens = JSON.stringify(tokens);
      const serializedUser = JSON.stringify(user);
      await SecureStorage.setItem(SECURE_STORAGE_KEYS.AUTH_TOKENS, serializedTokens);
      await SecureStorage.setItem(SECURE_STORAGE_KEYS.USER_PROFILE, serializedUser);

      this.updateState({
        user,
        tokens,
        state: "PLATFORM_AUTHENTICATED",
      });

      // Query active memberships
      const wsRes = await mobileApiClient.get<BackendEnvelope<WorkspacesResponseData>>(
        "/workspaces",
        { token: tokens.accessToken },
      );

      if (!wsRes.ok) {
        this.updateState({
          isLoading: false,
          error: wsRes.message || "Failed to load workspaces",
        });
        return { ok: false, error: wsRes.message };
      }

      const wsData = unwrapResponse<WorkspacesResponseData>(wsRes.data);
      const memberships = wsData?.memberships || [];
      this.updateState({ memberships });

      if (memberships.length === 0) {
        this.updateState({
          state: "PLATFORM_AUTHENTICATED",
          isLoading: false,
          error: "Your account does not have access to any active workspaces.",
        });
        return { ok: true };
      }

      // If exactly ONE active workspace exists -> auto activate it
      if (memberships.length === 1) {
        const single = memberships[0]!;
        await this.selectWorkspace(single.workspaceId, tokens.accessToken);
        return { ok: true };
      }

      // If MULTIPLE workspaces exist -> show native selector
      this.updateState({
        state: "WORKSPACE_SELECTION",
        isLoading: false,
        error: null,
      });

      return { ok: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      this.updateState({
        isLoading: false,
        error: msg,
      });
      return { ok: false, error: msg };
    }
  }

  /**
   * Activate tenant workspace session via POST /api/mobile/v2/workspaces/:workspaceId/session.
   */
  public async selectWorkspace(workspaceId: string, explicitToken?: string): Promise<boolean> {
    this.updateState({ isLoading: true, error: null });

    try {
      // Find candidate membership in currently loaded memberships
      const localMembership = this.state.memberships.find((m) => m.workspaceId === workspaceId);

      const token = explicitToken || this.state.tokens?.accessToken;
      if (token && !token.startsWith("mock_")) {
        const res = await mobileApiClient.post<BackendEnvelope<WorkspaceSessionResponseData>>(`/workspaces/${workspaceId}/session`, {}, {
          token,
          skipAuth: !token,
        });

        if (!res.ok) {
          this.updateState({
            isLoading: false,
            error: res.message || "Failed to activate workspace",
          });
          return false;
        }

        const sessionData = unwrapResponse<WorkspaceSessionResponseData>(res.data);
        if (!sessionData || !sessionData.workspace || !sessionData.membership || !sessionData.tokens) {
          this.updateState({
            isLoading: false,
            error: "Malformed workspace session response from server",
          });
          return false;
        }

        const { workspace, membership, tokens: newTokens } = sessionData;

        if (
          typeof newTokens.accessToken !== "string" || newTokens.accessToken.trim().length === 0 ||
          typeof newTokens.expiresAt !== "number" || !Number.isFinite(newTokens.expiresAt) || newTokens.expiresAt <= 0
        ) {
          this.updateState({
            isLoading: false,
            error: "Invalid workspace token received from server",
          });
          return false;
        }

        // Update stored access token with workspace-scoped token
        if (this.state.tokens) {
          const updatedTokens: MobileAuthTokens = {
            ...this.state.tokens,
            accessToken: newTokens.accessToken,
            expiresAt: newTokens.expiresAt,
          };
          await SecureStorage.setItem(SECURE_STORAGE_KEYS.AUTH_TOKENS, JSON.stringify(updatedTokens));
          await SecureStorage.setItem(SECURE_STORAGE_KEYS.ACTIVE_WORKSPACE_ID, workspaceId);

          this.updateState({
            tokens: updatedTokens,
            activeWorkspace: workspace,
            activeMembership: membership,
            state: "WORKSPACE_ACTIVE",
            isLoading: false,
            error: null,
          });
        }
        return true;
      }

      // Mock / Offline fallback for unit tests
      if (localMembership) {
        await SecureStorage.setItem(SECURE_STORAGE_KEYS.ACTIVE_WORKSPACE_ID, workspaceId);
        this.updateState({
          activeWorkspace: localMembership.workspace,
          activeMembership: localMembership,
          state: "WORKSPACE_ACTIVE",
          isLoading: false,
          error: null,
        });
        return true;
      }

      this.updateState({
        isLoading: false,
        error: "Workspace not found",
      });
      return false;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Workspace activation failed";
      this.updateState({
        isLoading: false,
        error: msg,
      });
      return false;
    }
  }

  /**
   * Switch workspace back to selection state.
   */
  public async changeWorkspace(): Promise<void> {
    const priorWs = this.state.activeWorkspace?.id;
    await SecureStorage.removeItem(SECURE_STORAGE_KEYS.ACTIVE_WORKSPACE_ID);
    // Stage 4.6 / 4.7 — clear workspace-scoped lead tab caches on switch.
    clearLeadTasksCache(priorWs);
    clearLeadAppointmentsCache(priorWs);
    clearLeadConversationsCache(priorWs);
    clearLeadEngagementCache(priorWs);
    this.updateState({
      state: "WORKSPACE_SELECTION",
      activeMembership: null,
      activeWorkspace: null,
      error: null,
    });
  }

  /**
   * Real Native Logout:
   * - Calls server logout to revoke refresh session
   * - Clears local secure storage
   * - Returns to SIGNED_OUT state
   */
  public async signOut(): Promise<void> {
    try {
      if (this.state.tokens?.accessToken) {
        await mobileApiClient.post("/auth/logout", {
          refreshToken: this.state.tokens.refreshToken,
        }, {
          token: this.state.tokens.accessToken,
        }).catch(() => {});
      }
    } finally {
      await SecureStorage.clear();
      clearLeadTasksCache();
      clearLeadAppointmentsCache();
      clearLeadConversationsCache();
      clearLeadEngagementCache();
      this.updateState({
        state: "SIGNED_OUT",
        user: null,
        tokens: null,
        memberships: [],
        activeMembership: null,
        activeWorkspace: null,
        isLoading: false,
        error: null,
      });
    }
  }
}

export const mobileAuthController = new MobileAuthController();
