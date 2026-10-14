/**
 * Stage 3K.5.19 — HouzzatPRO Native Auth Controller.
 *
 * Monotonic, single-owner state machine for native application authentication,
 * workspace discovery, cross-host token handoff, and session establishment.
 *
 * Guarantees:
 * 1. Exactly-once credential submission per user action.
 * 2. Exactly-once workspace bootstrap discovery per operation.
 * 3. Exactly-once handoff token minting per operation.
 * 4. Exactly-once handoff token exchange per code.
 * 5. Exactly-once final navigation.
 * 6. Clean, controlled retry state on consumed/invalid token errors without automatic refresh loops.
 * 7. Privacy-safe diagnostic logging (no passwords, tokens, cookies, or raw PII).
 */

import { signIn } from "next-auth/react";
import { hardGo } from "@/lib/mobile/nav-back";
import {
  isPlatformOperatorCallbackPath,
  isHouzzatVercelTestHost,
  resolveVercelTestPlainLoginHref,
  resolveVercelTestPostCredentialsHref,
  sanitizeStaffCallbackPath,
  shouldStayOnVercelTestOnboarding,
} from "@/lib/auth/pro-sign-in-routing";
import { isPlatformMobileBootstrapHost } from "@/lib/mobile/platform-bootstrap";
import { HOUZZATPRO_START_PATH } from "@/lib/mobile/app-shell";
import { performHardSignOut } from "@/lib/auth/hard-sign-out";
import { recordMobileDiagEvent, recordMobileDiagNav, type MobileDiagEventType } from "@/lib/mobile/runtime-diagnostic";
import type { MobileWorkspaceBootstrapState, MobileBootstrapMembership } from "@/lib/mobile/workspace-bootstrap";
import {
  appendOwnerOnboardingAuthQuery,
  OWNER_ONBOARDING_AUTH_QUERY,
  OWNER_ONBOARDING_RETURN_PATH,
  sanitizeOwnerOnboardingReturnPath,
  sanitizeWorkspaceHintId,
} from "@/lib/platform/activation/onboarding-pro-auth";
import {
  isSuccessfulHandoffClientDestination,
  resolveHouzzatProPrivateStartupDestination,
} from "@/lib/mobile/workspace-destination";

function currentUserAgent(): string | null {
  if (typeof navigator === "undefined") return null;
  return navigator.userAgent;
}

/** Role CRM defaults → Agent Profile on HouzzatPro Private only. */
function finalizeStaffStartupDestination(destination: string): string {
  return resolveHouzzatProPrivateStartupDestination(
    destination,
    currentUserAgent(),
  );
}

export type NativeAuthState =
  | "SIGNED_OUT"
  | "AUTHENTICATING"
  | "PLATFORM_SESSION_READY"
  | "DISCOVERING_WORKSPACE"
  | "HANDOFF_CREATING"
  | "HANDOFF_CREATED"
  | "HANDOFF_NAVIGATING"
  | "HANDOFF_EXCHANGING"
  | "TENANT_SESSION_READY"
  | "FINAL_NAVIGATION"
  | "COMPLETE"
  | "ERROR";

export type NativeAuthSnapshot = {
  state: NativeAuthState;
  operationId: string;
  error: string | null;
  destination: string | null;
  activeWorkspaceId: string | null;
  isNative: boolean;
  memberships: MobileBootstrapMembership[];
  handoffUrl: string | null;
};

const STATE_ORDER: Record<NativeAuthState, number> = {
  SIGNED_OUT: 0,
  AUTHENTICATING: 1,
  PLATFORM_SESSION_READY: 2,
  DISCOVERING_WORKSPACE: 3,
  HANDOFF_CREATING: 4,
  HANDOFF_CREATED: 5,
  HANDOFF_NAVIGATING: 6,
  HANDOFF_EXCHANGING: 7,
  TENANT_SESSION_READY: 8,
  FINAL_NAVIGATION: 9,
  COMPLETE: 10,
  ERROR: -1,
};

const CONTROLLER_SESSION_KEY = "houzzat_pro_native_auth_controller_v1";

function generateOperationId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

function detectIsNative(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent || "";
  return ua.includes("HouzzatNative/1") || ua.includes("com.houzzat.pro");
}

function currentHost(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname;
}

class ProNativeAuthController {
  private snapshot: NativeAuthSnapshot;
  private listeners = new Set<(snapshot: NativeAuthSnapshot) => void>();
  private activeSubmitPromise: Promise<{ ok: boolean; error?: string }> | null = null;
  private activeDiscoveryPromise: Promise<{ ok: boolean; state?: MobileWorkspaceBootstrapState; error?: string }> | null = null;
  private activeHandoffPromise: Promise<string | null> | null = null;
  private activeExchangePromise: Promise<{ ok: boolean; destination?: string; error?: string }> | null = null;
  private exchangedCodes = new Set<string>();
  /** Non-authoritative onboarding return metadata (Stage 6.10C.3). */
  private pendingReturnPath: typeof OWNER_ONBOARDING_RETURN_PATH | null = null;
  private pendingWorkspaceHint: string | null = null;

  constructor() {
    this.snapshot = this.loadInitialSnapshot();
  }

  /** Capture sanitized onboarding return metadata from Pro sign-in query. */
  public setOnboardingAuthMeta(input: {
    returnPath?: string | null;
    workspaceHint?: string | null;
  }): void {
    this.pendingReturnPath = sanitizeOwnerOnboardingReturnPath(input.returnPath);
    this.pendingWorkspaceHint = sanitizeWorkspaceHintId(input.workspaceHint);
  }

  public getOnboardingAuthMeta(): {
    returnPath: typeof OWNER_ONBOARDING_RETURN_PATH | null;
    workspaceHint: string | null;
  } {
    return {
      returnPath: this.pendingReturnPath,
      workspaceHint: this.pendingWorkspaceHint,
    };
  }

  private loadInitialSnapshot(): NativeAuthSnapshot {
    const isNative = detectIsNative();
    const defaultSnapshot: NativeAuthSnapshot = {
      state: "SIGNED_OUT",
      operationId: generateOperationId(),
      error: null,
      destination: null,
      activeWorkspaceId: null,
      isNative,
      memberships: [],
      handoffUrl: null,
    };

    if (typeof window === "undefined") return defaultSnapshot;

    try {
      const raw = sessionStorage.getItem(CONTROLLER_SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<NativeAuthSnapshot>;
        if (parsed.state && parsed.operationId) {
          return {
            ...defaultSnapshot,
            ...parsed,
            isNative,
          };
        }
      }
    } catch {
      // ignore
    }

    return defaultSnapshot;
  }

  private persistSnapshot(): void {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(CONTROLLER_SESSION_KEY, JSON.stringify(this.snapshot));
    } catch {
      // ignore
    }
  }

  public getSnapshot(): NativeAuthSnapshot {
    return this.snapshot;
  }

  public subscribe(listener: (snapshot: NativeAuthSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.persistSnapshot();
    for (const listener of this.listeners) {
      try {
        listener(this.snapshot);
      } catch (err) {
        console.error("[native-auth-controller] Listener error:", err);
      }
    }
  }

  private transitionTo(nextState: NativeAuthState, meta?: Partial<NativeAuthSnapshot>): boolean {
    const currentOrder = STATE_ORDER[this.snapshot.state];
    const nextOrder = STATE_ORDER[nextState];

    // ERROR can be set from any active state
    if (nextState !== "ERROR" && nextState !== "SIGNED_OUT" && nextOrder <= currentOrder) {
      console.warn(
        `[native-auth-controller] Disallowed non-monotonic transition: ${this.snapshot.state} -> ${nextState}`,
      );
      return false;
    }

    this.snapshot = {
      ...this.snapshot,
      ...meta,
      state: nextState,
      isNative: detectIsNative(),
    };

    this.logDiagnostic(nextState, meta?.destination);
    this.notify();
    return true;
  }

  private logDiagnostic(event: string, destination?: string | null): void {
    if (!this.snapshot.isNative) return;
    recordMobileDiagNav();

    let diagType: MobileDiagEventType = "APP_BOOT";
    switch (event) {
      case "AUTHENTICATING":
      case "AUTH_SUBMIT_STARTED":
        diagType = "APP_BOOT";
        break;
      case "PLATFORM_SESSION_READY":
      case "AUTH_SUBMIT_SUCCESS":
        diagType = "PLATFORM_SESSION_FOUND";
        break;
      case "DISCOVERING_WORKSPACE":
      case "BOOTSTRAP_STARTED":
        diagType = "WORKSPACE_BOOTSTRAP_START";
        break;
      case "BOOTSTRAP_SUCCESS":
        diagType = "WORKSPACE_COUNT_1";
        break;
      case "HANDOFF_CREATING":
      case "HANDOFF_CREATE_STARTED":
        diagType = "HANDOFF_MINT_START";
        break;
      case "HANDOFF_CREATED":
      case "HANDOFF_CREATE_SUCCESS":
        diagType = "HANDOFF_MINT_SUCCESS";
        break;
      case "HANDOFF_NAVIGATING":
      case "HANDOFF_NAVIGATION_STARTED":
        diagType = "NAVIGATE_TENANT";
        break;
      case "HANDOFF_EXCHANGING":
      case "HANDOFF_EXCHANGE_STARTED":
        diagType = "HANDOFF_EXCHANGE_START";
        break;
      case "TENANT_SESSION_READY":
      case "HANDOFF_EXCHANGE_SUCCESS":
        diagType = "HANDOFF_EXCHANGE_SUCCESS";
        break;
      case "FINAL_NAVIGATION":
      case "FINAL_NAVIGATION_STARTED":
        diagType = destination === "/admin" ? "DESTINATION_ADMIN" : "DESTINATION_AGENT";
        break;
      case "COMPLETE":
        diagType = "TENANT_SESSION_FOUND";
        break;
      case "ERROR":
        diagType = "HANDOFF_EXCHANGE_FAILED";
        break;
    }

    recordMobileDiagEvent(
      diagType,
      JSON.stringify({
        evt: event,
        op: this.snapshot.operationId,
        st: this.snapshot.state,
        host: currentHost(),
        dest: destination ?? this.snapshot.destination ?? undefined,
        nat: this.snapshot.isNative ? "yes" : "no",
      }),
    );
  }

  /**
   * Exactly-once credential submission.
   */
  public async submitCredentials(input: {
    email: string;
    password: string;
    callbackUrl?: string | null;
    returnPath?: string | null;
    workspaceHint?: string | null;
  }): Promise<{ ok: boolean; error?: string }> {
    if (this.activeSubmitPromise) {
      return this.activeSubmitPromise;
    }

    if (this.snapshot.state === "AUTHENTICATING") {
      return { ok: false, error: "Authentication in progress" };
    }

    // A new credential submit is a new operation. sessionStorage keeps
    // HANDOFF_NAVIGATING/COMPLETE after the first tenant handoff in this tab;
    // without a reset, AUTHENTICATING is rejected as non-monotonic and
    // discoverWorkspace returns ok without navigating — the form stays on
    // “Signing in…”. Closing the tab clears sessionStorage and “fixes” it.
    if (this.snapshot.state !== "SIGNED_OUT") {
      this.reset("SIGNED_OUT");
    }

    this.setOnboardingAuthMeta({
      returnPath: input.returnPath,
      workspaceHint: input.workspaceHint,
    });

    const opId = generateOperationId();
    this.transitionTo("AUTHENTICATING", {
      operationId: opId,
      error: null,
      destination: null,
    });
    this.logDiagnostic("AUTH_SUBMIT_STARTED");

    this.activeSubmitPromise = (async () => {
      try {
        const normalizedEmail = input.email.trim().toLowerCase();
        const workspaceId = sanitizeWorkspaceHintId(input.workspaceHint);
        const result = await signIn("credentials", {
          email: normalizedEmail,
          password: input.password,
          ...(workspaceId ? { workspaceId } : {}),
          redirect: false,
        });

        if (result?.error) {
          const errDetail =
            result.error === "Configuration"
              ? "Sign-in is temporarily unavailable. Please try again shortly."
              : "Invalid email or password.";
          this.transitionTo("ERROR", { error: errDetail });
          return { ok: false, error: errDetail };
        }

        this.transitionTo("PLATFORM_SESSION_READY");
        this.logDiagnostic("AUTH_SUBMIT_SUCCESS");

        if (input.callbackUrl && input.callbackUrl.includes("diag=1")) {
          hardGo("/pro?diag=1");
          return { ok: true };
        }

        const vercelHref = resolveVercelTestPostCredentialsHref({
          hostname: currentHost(),
          callbackUrl: input.callbackUrl,
          returnPath: input.returnPath ?? this.pendingReturnPath,
        });
        if (vercelHref) {
          this.transitionTo("FINAL_NAVIGATION", { destination: vercelHref });
          hardGo(vercelHref);
          return { ok: true };
        }
        if (isHouzzatVercelTestHost(currentHost())) {
          await this.finishVercelTestPlainLogin();
          return { ok: true };
        }

        // Master Admin /platform login is not native workspace bootstrap.
        // On tenant hosts, bootstrap would attempt a handoff that can
        // only be minted from app.houzzatpro.com, then never navigate — the
        // form stays on “Signing in…”. requirePlatformOperator still gates /platform.
        if (isPlatformOperatorCallbackPath(input.callbackUrl)) {
          const destination = sanitizeStaffCallbackPath(
            input.callbackUrl,
            "/platform",
          );
          this.transitionTo("FINAL_NAVIGATION", { destination });
          hardGo(destination);
          return { ok: true };
        }

        // Physical Vercel R2 test host only. Keep /onboarding on this origin
        // instead of minting a handoff to the workspace canonical HouzzatPRO
        // domain (Cloudflare). Handoff allowlists and canonical origin are unchanged.
        if (
          shouldStayOnVercelTestOnboarding({
            hostname: currentHost(),
            callbackUrl: input.callbackUrl,
            returnPath: input.returnPath ?? this.pendingReturnPath,
          })
        ) {
          this.transitionTo("FINAL_NAVIGATION", {
            destination: OWNER_ONBOARDING_RETURN_PATH,
          });
          hardGo(OWNER_ONBOARDING_RETURN_PATH);
          return { ok: true };
        }

        // Fast-path: discover workspace and navigate. Every success path must
        // terminate with hardGo or an explicit error — never leave Sign in pending.
        try {
          const disc = await this.discoverWorkspace();
          if (disc.ok && disc.state?.kind === "select_workspace") {
            hardGo(
              appendOwnerOnboardingAuthQuery(HOUZZATPRO_START_PATH, {
                returnPath: this.pendingReturnPath,
                workspaceHint: this.pendingWorkspaceHint,
              }),
            );
            return { ok: true };
          }
          if (disc.ok && disc.state?.kind === "no_workspace") {
            // PlatformOperator with no tenant memberships — only valid destination
            // on the Pro bootstrap host is the control plane. Elsewhere: explicit error.
            if (isPlatformMobileBootstrapHost(currentHost())) {
              this.transitionTo("FINAL_NAVIGATION", { destination: "/platform" });
              hardGo("/platform");
              return { ok: true };
            }
            this.transitionTo("ERROR", {
              error: "No active workspace membership found.",
            });
            return {
              ok: false,
              error: "No active workspace membership found.",
            };
          }
          if (
            disc.ok &&
            (disc.state?.kind === "handoff" ||
              disc.state?.kind === "tenant_destination")
          ) {
            // discoverWorkspace / createHandoff already called hardGo.
            return { ok: true };
          }
          if (!disc.ok) {
            const fallback = appendOwnerOnboardingAuthQuery(HOUZZATPRO_START_PATH, {
              returnPath: this.pendingReturnPath,
              workspaceHint: this.pendingWorkspaceHint,
            });
            this.transitionTo("FINAL_NAVIGATION", { destination: fallback });
            hardGo(fallback);
            return {
              ok: false,
              error: disc.error ?? "Unable to open your workspace.",
            };
          }
          // Unknown ok state — still leave the sign-in button.
          hardGo(
            appendOwnerOnboardingAuthQuery(HOUZZATPRO_START_PATH, {
              returnPath: this.pendingReturnPath,
              workspaceHint: this.pendingWorkspaceHint,
            }),
          );
          return { ok: true };
        } catch {
          hardGo(
            appendOwnerOnboardingAuthQuery(HOUZZATPRO_START_PATH, {
              returnPath: this.pendingReturnPath,
              workspaceHint: this.pendingWorkspaceHint,
            }),
          );
          return { ok: true };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Authentication failed";
        this.transitionTo("ERROR", { error: msg });
        return { ok: false, error: msg };
      } finally {
        this.activeSubmitPromise = null;
      }
    })();

    return this.activeSubmitPromise;
  }

  /**
   * Exact-host plain login (no /platform callback). Never lands on blank /pro.
   * This-host tenant staff → /admin or /agent. Else MASTER_ADMIN → /platform.
   */
  public async finishVercelTestPlainLogin(): Promise<void> {
    let href = "/platform";
    try {
      const res = await fetch("/api/mobile/workspace-bootstrap", {
        cache: "no-store",
        credentials: "include",
      });
      if (res.ok) {
        const data = (await res.json()) as {
          bootstrap?: {
            kind?: string | null;
            destination?: string | null;
            membership?: { role?: string | null } | null;
            memberships?: Array<{ role?: string | null }> | null;
          };
          memberships?: Array<{ role?: string | null }> | null;
        };
        href = resolveVercelTestPlainLoginHref({
          kind: data.bootstrap?.kind,
          destination: data.bootstrap?.destination,
          membership: data.bootstrap?.membership,
          memberships:
            data.bootstrap?.memberships ?? data.memberships ?? null,
        });
      }
    } catch {
      href = "/platform";
    }
    this.transitionTo("FINAL_NAVIGATION", { destination: href });
    hardGo(href);
  }

  /**
   * Exactly-once workspace discovery.
   */
  public async discoverWorkspace(): Promise<{
    ok: boolean;
    state?: MobileWorkspaceBootstrapState;
    error?: string;
  }> {
    if (this.activeDiscoveryPromise) {
      return this.activeDiscoveryPromise;
    }

    // Monotonic guard: if already past discovery in this session, return existing snapshot
    if (STATE_ORDER[this.snapshot.state] > STATE_ORDER.DISCOVERING_WORKSPACE) {
      return { ok: true };
    }

    this.transitionTo("DISCOVERING_WORKSPACE", { error: null });
    this.logDiagnostic("BOOTSTRAP_STARTED");

    this.activeDiscoveryPromise = (async () => {
      try {
        const bootstrapQuery = this.pendingWorkspaceHint
          ? `?${OWNER_ONBOARDING_AUTH_QUERY.workspaceHint}=${encodeURIComponent(this.pendingWorkspaceHint)}`
          : "";
        const res = await fetch(`/api/mobile/workspace-bootstrap${bootstrapQuery}`, {
          cache: "no-store",
          credentials: "include",
        });

        if (!res.ok) {
          const err = `Unable to load workspaces (${res.status})`;
          this.transitionTo("ERROR", { error: err });
          return { ok: false, error: err };
        }

        const data = (await res.json()) as {
          authenticated: boolean;
          bootstrap: MobileWorkspaceBootstrapState;
        };

        if (!data.authenticated || !data.bootstrap) {
          const err = "Unauthenticated platform session";
          this.transitionTo("ERROR", { error: err });
          return { ok: false, error: err };
        }

        const { bootstrap } = data;
        this.logDiagnostic("BOOTSTRAP_SUCCESS");

        if (bootstrap.kind === "no_workspace") {
          this.transitionTo("ERROR", { error: "No active workspace membership found." });
          return { ok: true, state: bootstrap };
        }

        if (bootstrap.kind === "select_workspace") {
          this.snapshot = {
            ...this.snapshot,
            memberships: bootstrap.memberships,
          };
          this.notify();
          return { ok: true, state: bootstrap };
        }

        if (bootstrap.kind === "tenant_destination") {
          const destination = finalizeStaffStartupDestination(
            this.pendingReturnPath ?? bootstrap.destination,
          );
          this.transitionTo("FINAL_NAVIGATION", {
            destination,
            activeWorkspaceId: bootstrap.membership.workspaceId,
          });
          this.logDiagnostic("FINAL_NAVIGATION_STARTED", destination);
          hardGo(destination);
          return { ok: true, state: bootstrap };
        }

        if (bootstrap.kind === "handoff") {
          const handoffUrl = await this.createHandoff(
            bootstrap.membership.workspaceId,
          );
          if (!handoffUrl) {
            return {
              ok: false,
              error: this.snapshot.error ?? "Handoff mint failed",
            };
          }
          return { ok: true, state: bootstrap };
        }

        return { ok: true, state: bootstrap };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Discovery network error";
        this.transitionTo("ERROR", { error: msg });
        return { ok: false, error: msg };
      } finally {
        this.activeDiscoveryPromise = null;
      }
    })();

    return this.activeDiscoveryPromise;
  }

  /**
   * Exactly-once handoff token creation per workspace operation.
   */
  public async createHandoff(workspaceId: string): Promise<string | null> {
    if (this.activeHandoffPromise) {
      return this.activeHandoffPromise;
    }

    if (
      this.snapshot.state === "HANDOFF_CREATED" ||
      this.snapshot.state === "HANDOFF_NAVIGATING"
    ) {
      if (this.snapshot.handoffUrl) {
        hardGo(this.snapshot.handoffUrl);
        return this.snapshot.handoffUrl;
      }
    }

    this.transitionTo("HANDOFF_CREATING", {
      activeWorkspaceId: workspaceId,
      error: null,
    });
    this.logDiagnostic("HANDOFF_CREATE_STARTED");

    this.activeHandoffPromise = (async () => {
      try {
        const res = await fetch("/api/mobile/workspace-handoff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            workspaceId,
            ...(this.pendingReturnPath
              ? { returnPath: this.pendingReturnPath }
              : {}),
          }),
        });

        if (!res.ok) {
          const errDetail = `Handoff mint failed (HTTP ${res.status})`;
          this.transitionTo("ERROR", { error: errDetail });
          return null;
        }

        const data = (await res.json()) as { handoffUrl?: string };
        const handoffUrl = data.handoffUrl ?? null;
        if (!handoffUrl) {
          this.transitionTo("ERROR", { error: "Missing handoff URL from server" });
          return null;
        }

        this.transitionTo("HANDOFF_CREATED", { handoffUrl });
        this.logDiagnostic("HANDOFF_CREATE_SUCCESS");

        this.transitionTo("HANDOFF_NAVIGATING");
        this.logDiagnostic("HANDOFF_NAVIGATION_STARTED", handoffUrl);

        hardGo(handoffUrl);
        return handoffUrl;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Handoff creation network error";
        this.transitionTo("ERROR", { error: msg });
        return null;
      } finally {
        this.activeHandoffPromise = null;
      }
    })();

    return this.activeHandoffPromise;
  }

  /**
   * Exactly-once handoff token exchange on tenant host.
   */
  public async exchangeHandoff(code: string): Promise<{
    ok: boolean;
    destination?: string;
    error?: string;
  }> {
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      const err = "Missing workspace handoff code";
      this.transitionTo("ERROR", { error: err });
      return { ok: false, error: err };
    }

    if (this.exchangedCodes.has(trimmedCode)) {
      if (this.snapshot.state === "COMPLETE" || this.snapshot.state === "FINAL_NAVIGATION") {
        if (this.snapshot.destination) {
          hardGo(this.snapshot.destination);
          return { ok: true, destination: this.snapshot.destination };
        }
      }
      return { ok: false, error: "Handoff code already exchanged in this session." };
    }

    if (this.activeExchangePromise) {
      return this.activeExchangePromise;
    }

    this.exchangedCodes.add(trimmedCode);
    this.transitionTo("HANDOFF_EXCHANGING", { error: null });
    this.logDiagnostic("HANDOFF_EXCHANGE_STARTED");

    this.activeExchangePromise = (async () => {
      try {
        const res = await fetch("/api/mobile/workspace-handoff", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ code: trimmedCode }),
        });

        if (!res.ok) {
          const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
          const errDetail = errJson?.error ?? `HTTP ${res.status}`;
          const safeError = `Workspace handoff failed (${errDetail}).`;
          this.transitionTo("ERROR", { error: safeError });
          return { ok: false, error: safeError };
        }

        const data = (await res.json()) as { destination?: string } | null;
        const destination = data?.destination;

        if (!isSuccessfulHandoffClientDestination(destination)) {
          const err = "Workspace handoff returned invalid staff destination.";
          this.transitionTo("ERROR", { error: err });
          return { ok: false, error: err };
        }

        const finalDestination = finalizeStaffStartupDestination(destination);

        this.transitionTo("TENANT_SESSION_READY", {
          destination: finalDestination,
        });
        this.logDiagnostic("HANDOFF_EXCHANGE_SUCCESS", finalDestination);

        this.transitionTo("FINAL_NAVIGATION");
        this.logDiagnostic("FINAL_NAVIGATION_STARTED", finalDestination);

        this.transitionTo("COMPLETE");
        hardGo(finalDestination);

        return { ok: true, destination: finalDestination };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Exchange network error";
        const safeError = `Workspace handoff failed (${msg}).`;
        this.transitionTo("ERROR", { error: safeError });
        return { ok: false, error: safeError };
      } finally {
        this.activeExchangePromise = null;
      }
    })();

    return this.activeExchangePromise;
  }

  /**
   * Controlled Retry: Resets in-flight exchange guards and initiates a clean new operation
   * from platform bootstrap, obtaining a fresh code.
   */
  public retry(): void {
    const host = currentHost();
    const isPlatform = isPlatformMobileBootstrapHost(host);
    const opId = generateOperationId();

    this.activeSubmitPromise = null;
    this.activeDiscoveryPromise = null;
    this.activeHandoffPromise = null;
    this.activeExchangePromise = null;
    this.exchangedCodes.clear();

    this.snapshot = {
      state: isPlatform ? "PLATFORM_SESSION_READY" : "SIGNED_OUT",
      operationId: opId,
      error: null,
      destination: null,
      activeWorkspaceId: null,
      isNative: detectIsNative(),
      memberships: [],
      handoffUrl: null,
    };
    this.notify();

    if (isHouzzatVercelTestHost(host)) {
      hardGo("/pro/sign-in");
      return;
    }
    if (isPlatform) {
      hardGo(HOUZZATPRO_START_PATH);
    } else {
      hardGo("https://app.houzzatpro.com/pro/sign-in");
    }
  }

  /**
   * Complete Sign Out.
   */
  public async signOut(): Promise<void> {
    this.reset();
    await performHardSignOut({ isStaff: true });
  }

  /**
   * Full reset.
   */
  public reset(state: NativeAuthState = "SIGNED_OUT"): void {
    this.activeSubmitPromise = null;
    this.activeDiscoveryPromise = null;
    this.activeHandoffPromise = null;
    this.activeExchangePromise = null;
    this.exchangedCodes.clear();
    this.pendingReturnPath = null;
    this.pendingWorkspaceHint = null;

    this.snapshot = {
      state,
      operationId: generateOperationId(),
      error: null,
      destination: null,
      activeWorkspaceId: null,
      isNative: detectIsNative(),
      memberships: [],
      handoffUrl: null,
    };
    this.persistSnapshot();
    this.notify();
  }
}

// Global Singleton
export const proNativeAuthController = new ProNativeAuthController();
