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
import { clearAllWorkspaceCaches } from "../lib/lead-tab-cache";
import { clearLeadListCache } from "../lib/lead-list-cache";
import { SecureStorage, SECURE_STORAGE_KEYS } from "../storage/secure-storage";
// Hardware keystore engine is initialized from App entry — not here —
// so Node selftests can load the controller without transforming react-native.
// Push unregister is dynamically imported in signOut for the same reason.
import type {
  MobileAuthState,
  MobileAuthTokens,
  MobileIdentityChoice,
  MobileNavigationState,
  MobileUser,
} from "../types/auth";
import type { MobileWorkspace, MobileWorkspaceMembership } from "../types/workspace";
import type {
  BackendEnvelope,
  DiscoverResponseData,
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
    identityChoices: [],
    activeMembership: null,
    activeWorkspace: null,
    error: null,
    isLoading: true,
  };

  private listeners = new Set<StateListener>();
  /** Single-flight silent refresh — avoids stampedes after idle. */
  private refreshInFlight: Promise<boolean> | null = null;
  /** Refresh access token this many ms before hard expiry. */
  private static readonly ACCESS_SKEW_MS = 2 * 60 * 1000;
  /**
   * Credentials retained only in memory while the agent picks among
   * password-verified discover matches (never written to SecureStorage).
   */
  private pendingCredentials: { email: string; password: string } | null = null;

  constructor() {
    mobileApiClient.setTokenProvider(async () => this.ensureFreshAccessToken());
    mobileApiClient.setWorkspaceIdProvider(() => this.state.activeWorkspace?.id ?? null);
    mobileApiClient.setUnauthorizedHandler(async () => this.refreshAccessToken({ force: true }));
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
   * Return a usable access token, silently refreshing when near/past expiry.
   * Used by every authenticated API call via the token provider.
   */
  public async ensureFreshAccessToken(): Promise<string | null> {
    const tokens = this.state.tokens;
    if (!tokens?.accessToken) return null;

    const expiresAt = tokens.expiresAt;
    const needsRefresh =
      typeof expiresAt !== "number" ||
      !Number.isFinite(expiresAt) ||
      Date.now() >= expiresAt - MobileAuthController.ACCESS_SKEW_MS;

    if (!needsRefresh) return tokens.accessToken;

    const refreshed = await this.refreshAccessToken({ force: false });
    if (refreshed && this.state.tokens?.accessToken) {
      return this.state.tokens.accessToken;
    }

    // Refresh failed — still return the existing token; request may 401 and retry once.
    return this.state.tokens?.accessToken ?? null;
  }

  /**
   * Called when the app returns to the foreground after background/idle.
   * Keeps the session warm without user-visible login prompts.
   */
  public async onAppForeground(): Promise<void> {
    if (this.state.state !== "WORKSPACE_ACTIVE" && this.state.state !== "PLATFORM_AUTHENTICATED") {
      return;
    }
    if (!this.state.tokens?.refreshToken) return;
    await this.refreshAccessToken({ force: false });
  }

  /**
   * Silent refresh using the long-lived refresh credential.
   * Rotates refresh token when the server returns a new one (sliding keep-alive).
   */
  public async refreshAccessToken(opts?: { force?: boolean }): Promise<boolean> {
    const tokens = this.state.tokens;
    if (!tokens?.refreshToken) return false;

    if (!opts?.force) {
      const expiresAt = tokens.expiresAt;
      const stillFresh =
        typeof expiresAt === "number" &&
        Number.isFinite(expiresAt) &&
        Date.now() < expiresAt - MobileAuthController.ACCESS_SKEW_MS;
      if (stillFresh) return true;
    }

    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      try {
        const activeWorkspaceId =
          this.state.activeWorkspace?.id ||
          (await SecureStorage.getItem(SECURE_STORAGE_KEYS.ACTIVE_WORKSPACE_ID)) ||
          undefined;

        const refreshRes = await mobileApiClient.post<BackendEnvelope<RefreshResponseData>>(
          "/auth/refresh",
          {
            refreshToken: tokens.refreshToken,
            activeWorkspaceId: activeWorkspaceId || undefined,
          },
          { skipAuth: true },
        );

        if (!refreshRes.ok) {
          // Only hard sign-out when the refresh credential itself is dead.
          if (refreshRes.code === "AUTH_REQUIRED") {
            await this.signOut();
          }
          return false;
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
          return false;
        }

        const nextRefresh =
          typeof refreshData.tokens.refreshToken === "string" &&
          refreshData.tokens.refreshToken.trim().length > 0
            ? refreshData.tokens.refreshToken
            : tokens.refreshToken;

        const activeTokens: MobileAuthTokens = {
          accessToken: refreshData.tokens.accessToken,
          refreshToken: nextRefresh,
          expiresAt: refreshData.tokens.expiresAt,
        };

        await SecureStorage.setItem(
          SECURE_STORAGE_KEYS.AUTH_TOKENS,
          JSON.stringify(activeTokens),
        );
        this.updateState({ tokens: activeTokens });
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      this.refreshInFlight = null;
    });

    return this.refreshInFlight;
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
          identityChoices: [],
          activeMembership: null,
          activeWorkspace: null,
          isLoading: false,
        });
        return;
      }

      const tokens = JSON.parse(rawTokens) as MobileAuthTokens;
      const user = JSON.parse(rawUser) as MobileUser;

      this.updateState({
        user,
        tokens,
      });

      // Silent keep-alive before any authenticated calls.
      const refreshed = await this.refreshAccessToken({ force: true });
      const activeTokens = this.state.tokens;
      if (!refreshed || !activeTokens?.accessToken) {
        // refreshAccessToken already signed out on AUTH_REQUIRED; otherwise stay signed out cleanly.
        if (this.state.state !== "SIGNED_OUT") {
          await this.signOut();
        }
        return;
      }

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
          identityChoices: [],
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
        identityChoices: [],
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
          identityChoices: [],
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
          identityChoices: [],
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
        identityChoices: [],
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
   * Real Native Login.
   *
   * Default (agent UX): email + password
   *   → POST /auth/discover (password-gated tenant identities)
   *   → 1 match: tenant login + auto workspace session
   *   → N matches: IDENTITY_SELECTION then tenant login
   *   → 0 matches: try explicit PlatformOperator login (mode: platform)
   *
   * Explicit platform: { mode: "platform" } — ACTIVE PlatformOperator only.
   */
  public async login(credentials: {
    email: string;
    password: string;
    mode?: "platform" | "tenant";
    workspaceId?: string;
  }): Promise<{ ok: boolean; error?: string }> {
    this.updateState({ isLoading: true, error: null });
    this.pendingCredentials = null;

    try {
      if (credentials.mode === "platform") {
        return await this.completePlatformLogin(credentials.email, credentials.password);
      }

      if (credentials.workspaceId) {
        return await this.completeTenantLogin(
          credentials.email,
          credentials.password,
          credentials.workspaceId,
        );
      }

      const discoverRes = await mobileApiClient.post<BackendEnvelope<DiscoverResponseData>>(
        "/auth/discover",
        {
          email: credentials.email,
          password: credentials.password,
        },
        { skipAuth: true },
      );

      if (discoverRes.ok) {
        const discoverData = unwrapResponse<DiscoverResponseData>(discoverRes.data);
        const matches = discoverData?.matches ?? [];

        if (matches.length === 1) {
          const only = matches[0]!;
          return await this.completeTenantLogin(
            credentials.email,
            credentials.password,
            only.workspaceId,
          );
        }

        if (matches.length > 1) {
          this.pendingCredentials = {
            email: credentials.email,
            password: credentials.password,
          };
          const identityChoices: MobileIdentityChoice[] = matches.map((m) => ({
            workspaceId: m.workspaceId,
            displayName: m.displayName,
            slug: m.slug,
            role: m.role,
          }));
          this.updateState({
            state: "IDENTITY_SELECTION",
            user: null,
            tokens: null,
            memberships: [],
            identityChoices,
            activeMembership: null,
            activeWorkspace: null,
            isLoading: false,
            error: null,
          });
          return { ok: true };
        }
      } else if (discoverRes.code === "RATE_LIMITED") {
        const msg =
          discoverRes.message ||
          "Too many sign-in attempts. Please try again later.";
        this.updateState({
          state: "SIGNED_OUT",
          identityChoices: [],
          isLoading: false,
          error: msg,
        });
        return { ok: false, error: msg };
      }

      // No tenant identities — PlatformOperator-only accounts still need access.
      return await this.completePlatformLogin(credentials.email, credentials.password);
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
   * Finish login after the agent picks among password-verified discover matches.
   * Re-authenticates with workspaceId (never trusts client-only workspace switch).
   */
  public async selectIdentity(workspaceId: string): Promise<{ ok: boolean; error?: string }> {
    const pending = this.pendingCredentials;
    if (!pending) {
      this.updateState({
        state: "SIGNED_OUT",
        identityChoices: [],
        isLoading: false,
        error: "Sign in again to choose a workspace.",
      });
      return { ok: false, error: "Sign in again to choose a workspace." };
    }

    const allowed = this.state.identityChoices.some((c) => c.workspaceId === workspaceId);
    if (!allowed) {
      this.updateState({
        isLoading: false,
        error: "That workspace is not available for this account.",
      });
      return { ok: false, error: "That workspace is not available for this account." };
    }

    this.updateState({ isLoading: true, error: null });
    return this.completeTenantLogin(pending.email, pending.password, workspaceId);
  }

  private async completePlatformLogin(
    email: string,
    password: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const loginRes = await mobileApiClient.post<BackendEnvelope<LoginResponseData>>(
      "/auth/login",
      { email, password, mode: "platform" },
      { skipAuth: true },
    );

      if (!loginRes.ok) {
      this.pendingCredentials = null;
      const msg =
        loginRes.code === "RATE_LIMITED"
          ? loginRes.message || "Too many sign-in attempts. Please try again later."
          : loginRes.message || "Invalid email or password";
      this.updateState({
        state: "SIGNED_OUT",
        identityChoices: [],
        isLoading: false,
        error: msg,
      });
      return { ok: false, error: msg };
    }

    return this.afterSuccessfulLogin(loginRes, { expectTenantWorkspace: false });
  }

  private async completeTenantLogin(
    email: string,
    password: string,
    workspaceId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const loginRes = await mobileApiClient.post<BackendEnvelope<LoginResponseData>>(
      "/auth/login",
      { email, password, workspaceId, mode: "tenant" },
      { skipAuth: true },
    );

    if (!loginRes.ok) {
      this.pendingCredentials = null;
      const msg =
        loginRes.code === "RATE_LIMITED"
          ? loginRes.message || "Too many sign-in attempts. Please try again later."
          : loginRes.message || "Invalid email or password";
      this.updateState({
        isLoading: false,
        error: msg,
      });
      return { ok: false, error: msg };
    }

    const result = await this.afterSuccessfulLogin(loginRes, {
      expectTenantWorkspace: true,
      preferredWorkspaceId: workspaceId,
    });
    if (result.ok) {
      this.pendingCredentials = null;
    }
    return result;
  }

  private async afterSuccessfulLogin(
    loginRes: { ok: boolean; data?: unknown; message?: string },
    opts: { expectTenantWorkspace: boolean; preferredWorkspaceId?: string },
  ): Promise<{ ok: boolean; error?: string }> {
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

    if (
      typeof user.id !== "string" ||
      user.id.trim().length === 0 ||
      typeof user.email !== "string" ||
      user.email.trim().length === 0 ||
      typeof tokens.accessToken !== "string" ||
      tokens.accessToken.trim().length === 0 ||
      typeof tokens.refreshToken !== "string" ||
      tokens.refreshToken.trim().length === 0 ||
      typeof tokens.expiresAt !== "number" ||
      !Number.isFinite(tokens.expiresAt) ||
      tokens.expiresAt <= 0
    ) {
      const errorMsg = "Invalid authentication tokens received from server";
      this.updateState({
        isLoading: false,
        error: errorMsg,
      });
      return { ok: false, error: errorMsg };
    }

    // Reject client/server workspace mismatch on tenant login.
    if (
      opts.expectTenantWorkspace &&
      opts.preferredWorkspaceId &&
      user.workspaceId &&
      user.workspaceId !== opts.preferredWorkspaceId
    ) {
      const errorMsg = "Workspace identity mismatch. Please sign in again.";
      this.updateState({ isLoading: false, error: errorMsg });
      return { ok: false, error: errorMsg };
    }

    const serializedTokens = JSON.stringify(tokens);
    const serializedUser = JSON.stringify(user);
    await SecureStorage.setItem(SECURE_STORAGE_KEYS.AUTH_TOKENS, serializedTokens);
    await SecureStorage.setItem(SECURE_STORAGE_KEYS.USER_PROFILE, serializedUser);

    this.updateState({
      user,
      tokens,
      identityChoices: [],
      state: "PLATFORM_AUTHENTICATED",
    });

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
      if (opts.expectTenantWorkspace) {
        this.updateState({
          state: "PLATFORM_AUTHENTICATED",
          isLoading: false,
          error: "Your account does not have access to any active workspaces.",
        });
        return { ok: false, error: "Your account does not have access to any active workspaces." };
      }
      this.updateState({
        state: "PLATFORM_AUTHENTICATED",
        isLoading: false,
        error: "Platform access only — no tenant workspace memberships on this identity.",
      });
      return { ok: true };
    }

    const preferred =
      opts.preferredWorkspaceId &&
      memberships.find((m) => m.workspaceId === opts.preferredWorkspaceId);

    if (preferred) {
      await this.selectWorkspace(preferred.workspaceId, tokens.accessToken);
      return { ok: true };
    }

    if (memberships.length === 1) {
      await this.selectWorkspace(memberships[0]!.workspaceId, tokens.accessToken);
      return { ok: true };
    }

    this.updateState({
      state: "WORKSPACE_SELECTION",
      isLoading: false,
      error: null,
    });
    return { ok: true };
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
   * Switch workspace back to selection state (same authenticated User only).
   * Cross-identity switches require signing out and discovering again.
   */
  public async changeWorkspace(): Promise<void> {
    const priorWs = this.state.activeWorkspace?.id;
    await SecureStorage.removeItem(SECURE_STORAGE_KEYS.ACTIVE_WORKSPACE_ID);
    // Stage 5.2 — one central clear for all workspace-scoped native caches.
    clearAllWorkspaceCaches(priorWs);
    clearLeadListCache(priorWs);
    this.updateState({
      state: "WORKSPACE_SELECTION",
      activeMembership: null,
      activeWorkspace: null,
      identityChoices: [],
      error: null,
    });
  }

  /**
   * Cancel pre-auth identity selection and return to sign-in.
   */
  public async cancelIdentitySelection(): Promise<void> {
    this.pendingCredentials = null;
    this.updateState({
      state: "SIGNED_OUT",
      user: null,
      tokens: null,
      memberships: [],
      identityChoices: [],
      activeMembership: null,
      activeWorkspace: null,
      isLoading: false,
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
    this.pendingCredentials = null;
    const priorUserId = this.state.user?.id ?? null;
    const priorAccess = this.state.tokens?.accessToken ?? null;
    try {
      const { unregisterHouzzatProPushForLogout } = await import(
        "../lib/push-registration"
      );
      await unregisterHouzzatProPushForLogout(priorUserId, priorAccess);
    } catch {
      // best-effort
    }
    try {
      if (this.state.tokens?.accessToken) {
        await mobileApiClient.post("/auth/logout", {
          refreshToken: this.state.tokens.refreshToken,
        }, {
          token: this.state.tokens.accessToken,
          _authRetried: true,
        }).catch(() => {});
      }
    } finally {
      await SecureStorage.clear();
      clearAllWorkspaceCaches();
      clearLeadListCache();
      this.updateState({
        state: "SIGNED_OUT",
        user: null,
        tokens: null,
        memberships: [],
        identityChoices: [],
        activeMembership: null,
        activeWorkspace: null,
        isLoading: false,
        error: null,
      });
    }
  }
}

export const mobileAuthController = new MobileAuthController();
