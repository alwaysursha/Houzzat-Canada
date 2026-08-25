"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Multi-membership staff must pick an active Workspace before CRM loads.
 * Single-membership users never see this gate.
 */
export function ActiveWorkspaceGate() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname === "/agent/workspace") return;
    // Stage 3I: deep-link handoff sets the cookie itself — do not bounce to chooser first.
    if (pathname?.startsWith("/agent/open-lead/")) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/agent/workspace", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { requiresSelection?: boolean };
        if (data.requiresSelection && !cancelled) {
          router.replace("/agent/workspace");
        }
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
