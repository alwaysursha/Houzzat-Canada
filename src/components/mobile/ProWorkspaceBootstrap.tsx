"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import { usePathname, useSearchParams } from "next/navigation";
import { HouzzatProMark } from "@/components/auth/HouzzatProMark";
import { HouzzatProWordmark } from "@/components/auth/HouzzatProWordmark";
import { ProWorkspaceTransition } from "@/components/mobile/ProWorkspaceTransition";
import { sanitizeStaffCallbackPath } from "@/lib/auth/pro-sign-in-routing";
import {
  HOUZZATPRO_START_PATH,
  resolveAppShell,
  syncAppShellCookie,
} from "@/lib/mobile/app-shell";
import {
  isPlatformMobileBootstrapHost,
  shouldRunProWorkspaceBootstrap,
} from "@/lib/mobile/platform-bootstrap";
import { hardGo } from "@/lib/mobile/nav-back";
import { peekPendingPushNavigation } from "@/lib/notifications/pending-push-nav";
import {
  isMobileDiagnosticFreezePath,
  recordMobileDiagEvent,
  recordMobileDiagNav,
  sanitizeDiagnosticHref,
  classifyWrongHostBootstrap,
} from "@/lib/mobile/runtime-diagnostic";
import {
  setNativeNavStage,
  getNativeNavStage,
  clearNativeNavStage,
} from "@/lib/mobile/native-route-latch";
import type {
  MobileBootstrapMembership,
  MobileWorkspaceBootstrapState,
} from "@/lib/mobile/workspace-bootstrap";

type BootstrapResponse = {
  authenticated: boolean;
  bootstrap: MobileWorkspaceBootstrapState;
};

type FrozenDecision = {
  kind: MobileWorkspaceBootstrapState["kind"];
  membership: MobileBootstrapMembership | null;
  memberships: MobileBootstrapMembership[];
  destination: string | null;
  hostStopReason: string | null;
};

function currentHostname(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname;
}

async function fetchBootstrap(): Promise<BootstrapResponse | null> {
  const res = await fetch("/api/mobile/workspace-bootstrap", {
    cache: "no-store",
    credentials: "include",
  });
  if (!res.ok) return null;
  return (await res.json()) as BootstrapResponse;
}

async function requestHandoff(workspaceId: string): Promise<string | null> {
  recordMobileDiagEvent("HANDOFF_MINT_START");
  const res = await fetch("/api/mobile/workspace-handoff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ workspaceId }),
  });
  if (!res.ok) {
    recordMobileDiagEvent("HANDOFF_MINT_FAILED", `http_${res.status}`);
    return null;
  }
  const data = (await res.json()) as { handoffUrl?: string };
  const handoffUrl = data.handoffUrl ?? null;
  if (!handoffUrl) {
    recordMobileDiagEvent("HANDOFF_MINT_FAILED", "missing_url");
    return null;
  }
  try {
    const host = new URL(handoffUrl).hostname;
    recordMobileDiagEvent("HANDOFF_MINT_SUCCESS", host);
  } catch {
    recordMobileDiagEvent("HANDOFF_MINT_SUCCESS", "url_ok");
  }
  return handoffUrl;
}

function WorkspaceCard({
  membership,
  pending,
  onSelect,
}: {
  membership: MobileBootstrapMembership;
  pending: boolean;
  onSelect: (workspaceId: string) => void;
}) {
  const accent = membership.primaryColor ?? "#0B5C49";
  const initial = membership.displayName.trim().charAt(0).toUpperCase() || "W";
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => onSelect(membership.workspaceId)}
      className="flex w-full items-center gap-3 rounded-2xl border border-white/35 bg-white/20 px-4 py-3 text-left shadow-sm backdrop-blur-md transition hover:bg-white/30 disabled:opacity-60"
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white"
        style={{ backgroundColor: accent }}
      >
        {initial}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">
          {membership.displayName}
        </span>
        <span className="block truncate text-xs text-ink/60">
          {membership.role} · {membership.canonicalHostname}
        </span>
      </span>
    </button>
  );
}

function freezeDecisionFromBootstrap(
  bootstrap: MobileWorkspaceBootstrapState,
  requestHostname: string,
): FrozenDecision {
  const memberships =
    bootstrap.kind === "select_workspace"
      ? bootstrap.memberships
      : bootstrap.kind === "handoff" || bootstrap.kind === "tenant_destination"
        ? [bootstrap.membership]
        : [];
  const membership =
    bootstrap.kind === "handoff" || bootstrap.kind === "tenant_destination"
      ? bootstrap.membership
      : memberships[0] ?? null;
  const hostStop = classifyWrongHostBootstrap({
    requestHostname,
    membershipSlugs: memberships.map((m) => m.slug),
  });
  return {
    kind: bootstrap.kind,
    membership,
    memberships,
    destination:
      bootstrap.kind === "tenant_destination" ? bootstrap.destination : null,
    hostStopReason: hostStop.stopReason,
  };
}

/**
 * HouzzatPRO platform bootstrap — resolves workspace membership then handoffs.
 * Diagnostic freeze (?diag=1 / /pro/mobile/diag): observe without auto-nav.
 */
export function ProWorkspaceBootstrap() {
  const { status } = useSession();
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const diagnosticFreeze = isMobileDiagnosticFreezePath(pathname, searchParams);
  const hostname =
    typeof window !== "undefined" ? window.location.hostname : "";
  const onProBootstrapSurface = shouldRunProWorkspaceBootstrap({
    pathname,
    hostname,
    isNative: Capacitor.isNativePlatform(),
  });
  const routed = useRef(false);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selector, setSelector] = useState<MobileBootstrapMembership[] | null>(
    null,
  );
  const [noWorkspace, setNoWorkspace] = useState(false);
  const [frozen, setFrozen] = useState<FrozenDecision | null>(null);
  const [freezeReleased, setFreezeReleased] = useState(false);

  useEffect(() => {
    if (!onProBootstrapSurface) return;
    if (routed.current) return;
    if (status === "loading") return;

    let cancelled = false;
    void (async () => {
      recordMobileDiagNav();
      const shell = await resolveAppShell();
      if (cancelled || routed.current) return;
      syncAppShellCookie(shell);
      const onAppBootstrapHost = isPlatformMobileBootstrapHost(
        currentHostname(),
      );
      // Native Pro shell OR browser on dedicated app.houzzatpro.com bootstrap host.
      if (shell !== "houzzatpro" && !onAppBootstrapHost) return;

      const pendingHref = peekPendingPushNavigation()?.href ?? null;
      if (status !== "authenticated") {
        if (diagnosticFreeze && !freezeReleased) {
          // Explicit ?diag=1: do not auto-redirect; operator inspects frozen state.
          routed.current = true;
          recordMobileDiagEvent("PLATFORM_SESSION_MISSING");
          setPending(false);
          setFrozen({
            kind: "platform_sign_in",
            membership: null,
            memberships: [],
            destination: "/pro/sign-in",
            hostStopReason: null,
          });
          return;
        }
        routed.current = true;
        recordMobileDiagEvent("PLATFORM_SESSION_MISSING");
        recordMobileDiagEvent("REDIRECT_SIGN_IN");
        const callback = sanitizeStaffCallbackPath(
          pendingHref,
          HOUZZATPRO_START_PATH,
        );
        hardGo(
          `/pro/sign-in?callbackUrl=${encodeURIComponent(callback)}`,
        );
        return;
      }

      // Latch before awaits so host/status churn cannot double-fetch.
      routed.current = true;
      setNativeNavStage("BOOTSTRAPPING");
      recordMobileDiagEvent("PLATFORM_SESSION_FOUND");
      recordMobileDiagEvent("WORKSPACE_BOOTSTRAP_START");
      setPending(true);
      setError(null);
      const payload = await fetchBootstrap();
      if (cancelled) return;
      if (!payload) {
        clearNativeNavStage();
        routed.current = false;
        setPending(false);
        setError("Unable to load workspaces. Try again.");
        return;
      }

      const { bootstrap } = payload;
      const requestHost = currentHostname();

      if (diagnosticFreeze && !freezeReleased) {
        setPending(false);
        if (bootstrap.kind === "no_workspace") {
          recordMobileDiagEvent("WORKSPACE_COUNT_0");
          setNoWorkspace(true);
        } else if (bootstrap.kind === "select_workspace") {
          recordMobileDiagEvent("WORKSPACE_SELECTOR");
        } else if (bootstrap.kind === "handoff" || bootstrap.kind === "tenant_destination") {
          recordMobileDiagEvent("WORKSPACE_COUNT_1", bootstrap.membership.slug);
        }
        setFrozen(freezeDecisionFromBootstrap(bootstrap, requestHost));
        return;
      }

      if (bootstrap.kind === "no_workspace") {
        recordMobileDiagEvent("WORKSPACE_COUNT_0");
        setPending(false);
        setNoWorkspace(true);
        return;
      }

      if (bootstrap.kind === "select_workspace") {
        recordMobileDiagEvent("WORKSPACE_SELECTOR");
        setPending(false);
        setSelector(bootstrap.memberships);
        return;
      }

      if (bootstrap.kind === "tenant_destination") {
        setNativeNavStage("FINAL_DESTINATION");
        recordMobileDiagEvent("WORKSPACE_COUNT_1", bootstrap.membership.slug);
        if (bootstrap.destination === "/admin") {
          recordMobileDiagEvent("DESTINATION_ADMIN");
        } else if (bootstrap.destination === "/agent") {
          recordMobileDiagEvent("DESTINATION_AGENT");
        }
        if (pendingHref) {
          hardGo(pendingHref);
          return;
        }
        hardGo(bootstrap.destination);
        return;
      }

      if (bootstrap.kind === "handoff") {
        // Single-workspace fast path: mint + cross-host without intermediate stop.
        setNativeNavStage("HANDOFF_STARTED");
        recordMobileDiagEvent("WORKSPACE_COUNT_1", bootstrap.membership.slug);
        const handoffUrl = await requestHandoff(bootstrap.membership.workspaceId);
        if (cancelled) return;
        if (!handoffUrl) {
          clearNativeNavStage();
          setPending(false);
          setError("Workspace handoff failed. Try again.");
          routed.current = false;
          return;
        }
        try {
          const target = new URL(handoffUrl);
          recordMobileDiagEvent(
            "NAVIGATE_TENANT",
            `${target.hostname}${target.pathname}`,
          );
        } catch {
          recordMobileDiagEvent(
            "NAVIGATE_TENANT",
            sanitizeDiagnosticHref(handoffUrl),
          );
        }
        hardGo(handoffUrl);
        return;
      }

      setPending(false);
      routed.current = false;
    })();

    return () => {
      cancelled = true;
    };
  }, [
    onProBootstrapSurface,
    pathname,
    status,
    diagnosticFreeze,
    freezeReleased,
  ]);

  if (!onProBootstrapSurface) {
    return null;
  }

  async function continueFromFreeze() {
    if (!frozen) return;
    setFreezeReleased(true);
    setFrozen(null);
    routed.current = false;
    setPending(true);
    setError(null);

    if (frozen.kind === "platform_sign_in") {
      recordMobileDiagEvent("REDIRECT_SIGN_IN");
      hardGo(
        `/pro/sign-in?callbackUrl=${encodeURIComponent("/pro?diag=1")}`,
      );
      return;
    }
    if (frozen.kind === "no_workspace") {
      setPending(false);
      setNoWorkspace(true);
      return;
    }
    if (frozen.kind === "select_workspace") {
      setPending(false);
      setSelector(frozen.memberships);
      return;
    }
    if (frozen.kind === "tenant_destination" && frozen.destination) {
      if (frozen.destination === "/admin") {
        recordMobileDiagEvent("DESTINATION_ADMIN");
      } else if (frozen.destination === "/agent") {
        recordMobileDiagEvent("DESTINATION_AGENT");
      }
      hardGo(frozen.destination);
      return;
    }
    if (frozen.kind === "handoff" && frozen.membership) {
      const handoffUrl = await requestHandoff(frozen.membership.workspaceId);
      setPending(false);
      if (!handoffUrl) {
        setError("Workspace handoff failed. Try again.");
        return;
      }
      try {
        const target = new URL(handoffUrl);
        recordMobileDiagEvent(
          "NAVIGATE_TENANT",
          `${target.hostname}${target.pathname}`,
        );
      } catch {
        recordMobileDiagEvent(
          "NAVIGATE_TENANT",
          sanitizeDiagnosticHref(handoffUrl),
        );
      }
      hardGo(handoffUrl);
      return;
    }
    setPending(false);
  }

  async function onSelectWorkspace(workspaceId: string) {
    setPending(true);
    setError(null);
    setNativeNavStage("HANDOFF_STARTED");
    recordMobileDiagEvent("WORKSPACE_SELECTOR", "user_pick");
    const handoffUrl = await requestHandoff(workspaceId);
    setPending(false);
    if (!handoffUrl) {
      clearNativeNavStage();
      setError("Workspace handoff failed. Try again.");
      return;
    }
    try {
      const target = new URL(handoffUrl);
      recordMobileDiagEvent(
        "NAVIGATE_TENANT",
        `${target.hostname}${target.pathname}`,
      );
    } catch {
      recordMobileDiagEvent(
        "NAVIGATE_TENANT",
        sanitizeDiagnosticHref(handoffUrl),
      );
    }
    hardGo(handoffUrl);
  }

  if (frozen) {
    const m = frozen.membership;
    return (
      <div className="mx-auto w-full max-w-md px-5 py-10">
        <p className="text-center text-sm font-bold text-amber-900">
          DIAGNOSTIC FREEZE — auto-handoff paused
        </p>
        <p className="mt-2 text-center text-xs text-ink/60">
          Read the diagnostic panel below. No navigation until you continue.
        </p>
        <div className="mt-4 space-y-1 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 font-mono text-[11px] text-amber-950">
          <p>bootstrap_kind: {frozen.kind}</p>
          <p>membership_count: {frozen.memberships.length}</p>
          <p>
            slugs:{" "}
            {frozen.memberships.map((x) => x.slug).join(", ") || "(none)"}
          </p>
          <p>roles: {frozen.memberships.map((x) => x.role).join(", ") || "(none)"}</p>
          <p>selected_slug: {m?.slug ?? "(none)"}</p>
          <p>selected_role: {m?.role ?? "(none)"}</p>
          <p>canonical_host: {m?.canonicalHostname ?? "(none)"}</p>
          <p>intended_destination: {frozen.destination ?? "(handoff)"}</p>
          {frozen.hostStopReason ? (
            <p className="pt-2 font-semibold text-danger">
              STOP: {frozen.hostStopReason}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => void continueFromFreeze()}
          className="mt-4 w-full rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Continuing…" : "Continue bootstrap"}
        </button>
        {error ? (
          <p className="mt-3 text-center text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (noWorkspace) {
    return (
      <div className="mx-auto flex min-h-[50dvh] w-full max-w-md flex-col items-center justify-center px-5 py-16 text-center">
        <p className="text-base font-semibold text-ink">No active workspace</p>
        <p className="mt-2 text-sm text-ink/60">
          This account has no active workspace membership. Contact your broker
          admin or Houzzat support.
        </p>
      </div>
    );
  }

  if (selector) {
    return (
      <div className="mx-auto w-full max-w-md px-5 py-10">
        <div className="text-center">
          <HouzzatProMark className="mx-auto" size={88} />
          <div className="mt-3">
            <HouzzatProWordmark size="lg" className="text-ink" />
          </div>
          <p className="mt-3 text-sm font-medium text-ink/70">
            Choose your workspace
          </p>
        </div>
        <div className="mt-6 space-y-3">
          {selector.map((membership) => (
            <WorkspaceCard
              key={membership.workspaceId}
              membership={membership}
              pending={pending}
              onSelect={onSelectWorkspace}
            />
          ))}
        </div>
        {error ? (
          <p className="mt-4 text-center text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex min-h-[50dvh] w-full max-w-md flex-col items-center justify-center px-5 py-16 text-center">
        <p className="text-sm font-medium text-danger">{error}</p>
      </div>
    );
  }

  // One continuous transition surface (bootstrap + handoff share branding).
  return <ProWorkspaceTransition />;
}
