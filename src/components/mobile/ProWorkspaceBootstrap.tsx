"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import { usePathname } from "next/navigation";
import { HouzzatProMark } from "@/components/auth/HouzzatProMark";
import { HouzzatProWordmark } from "@/components/auth/HouzzatProWordmark";
import { sanitizeStaffCallbackPath } from "@/lib/auth/pro-sign-in-routing";
import {
  HOUZZATPRO_START_PATH,
  resolveAppShell,
  syncAppShellCookie,
} from "@/lib/mobile/app-shell";
import { hardGo } from "@/lib/mobile/nav-back";
import { peekPendingPushNavigation } from "@/lib/notifications/pending-push-nav";
import type {
  MobileBootstrapMembership,
  MobileWorkspaceBootstrapState,
} from "@/lib/mobile/workspace-bootstrap";

type BootstrapResponse = {
  authenticated: boolean;
  bootstrap: MobileWorkspaceBootstrapState;
};

function isProRouterPath(pathname: string): boolean {
  return pathname === HOUZZATPRO_START_PATH || pathname === `${HOUZZATPRO_START_PATH}/`;
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
  const res = await fetch("/api/mobile/workspace-handoff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ workspaceId }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { handoffUrl?: string };
  return data.handoffUrl ?? null;
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

/**
 * HouzzatPRO platform bootstrap — resolves workspace membership then handoffs.
 */
export function ProWorkspaceBootstrap() {
  const { status } = useSession();
  const pathname = usePathname() || "/";
  const routed = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selector, setSelector] = useState<MobileBootstrapMembership[] | null>(
    null,
  );
  const [noWorkspace, setNoWorkspace] = useState(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    if (!isProRouterPath(pathname)) return;
    if (routed.current) return;
    if (status === "loading") return;

    let cancelled = false;
    void (async () => {
      const shell = await resolveAppShell();
      if (cancelled) return;
      syncAppShellCookie(shell);
      if (shell !== "houzzatpro") return;

      const pendingHref = peekPendingPushNavigation()?.href ?? null;
      if (status !== "authenticated") {
        routed.current = true;
        const callback = sanitizeStaffCallbackPath(
          pendingHref,
          HOUZZATPRO_START_PATH,
        );
        hardGo(
          `/pro/sign-in?callbackUrl=${encodeURIComponent(callback)}`,
        );
        return;
      }

      setPending(true);
      setError(null);
      const payload = await fetchBootstrap();
      if (cancelled) return;
      if (!payload) {
        setPending(false);
        setError("Unable to load workspaces. Try again.");
        return;
      }

      const { bootstrap } = payload;
      if (bootstrap.kind === "no_workspace") {
        routed.current = true;
        setPending(false);
        setNoWorkspace(true);
        return;
      }

      if (bootstrap.kind === "select_workspace") {
        routed.current = true;
        setPending(false);
        setSelector(bootstrap.memberships);
        return;
      }

      if (bootstrap.kind === "tenant_destination") {
        routed.current = true;
        setPending(false);
        if (pendingHref) {
          hardGo(pendingHref);
          return;
        }
        hardGo(bootstrap.destination);
        return;
      }

      if (bootstrap.kind === "handoff") {
        routed.current = true;
        const handoffUrl = await requestHandoff(bootstrap.membership.workspaceId);
        if (cancelled) return;
        setPending(false);
        if (!handoffUrl) {
          setError("Workspace handoff failed. Try again.");
          routed.current = false;
          return;
        }
        hardGo(handoffUrl);
        return;
      }

      setPending(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, status]);

  async function onSelectWorkspace(workspaceId: string) {
    setPending(true);
    setError(null);
    const handoffUrl = await requestHandoff(workspaceId);
    setPending(false);
    if (!handoffUrl) {
      setError("Workspace handoff failed. Try again.");
      return;
    }
    hardGo(handoffUrl);
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

  return (
    <div className="mx-auto flex min-h-[50dvh] w-full max-w-md flex-col items-center justify-center px-5 py-16 text-center">
      <p className="text-sm font-medium text-ink/50">
        {pending ? "Opening your workspace…" : "Opening HouzzatPro…"}
      </p>
    </div>
  );
}
