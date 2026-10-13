"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Multi-membership staff must pick an active Workspace before CRM loads.
 * Single-membership users never see this gate.
 *
 * After a successful "no selection needed" response, skip repeat fetches on
 * section navigation (pathname changes). Reset when visiting the chooser so a
 * workspace switch still re-checks.
 */
let workspaceGateCleared = false;

export function ActiveWorkspaceGate() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname === "/agent/workspace") {
      workspaceGateCleared = false;
      return;
    }
    // Stage 3I: deep-link handoff sets the cookie itself — do not bounce to chooser first.
    if (pathname?.startsWith("/agent/open-lead/")) return;
    if (workspaceGateCleared) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/agent/workspace", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { requiresSelection?: boolean };
        if (cancelled) return;
        if (data.requiresSelection) {
          router.replace("/agent/workspace");
          return;
        }
        workspaceGateCleared = true;
      } catch {
        // Gate is best-effort; server context still fails closed.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
