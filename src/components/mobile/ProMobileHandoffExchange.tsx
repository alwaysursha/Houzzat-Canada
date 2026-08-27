"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { hardGo } from "@/lib/mobile/nav-back";
import {
  recordMobileDiagEvent,
  recordMobileDiagNav,
} from "@/lib/mobile/runtime-diagnostic";

function isStaffRoleDestination(
  value: string | null | undefined,
): value is "/admin" | "/agent" {
  return value === "/admin" || value === "/agent";
}

function HandoffExchangeInner() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current || !code) return;
    started.current = true;
    recordMobileDiagNav();
    recordMobileDiagEvent("HANDOFF_EXCHANGE_START");

    void (async () => {
      const res = await fetch("/api/mobile/workspace-handoff", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        recordMobileDiagEvent("HANDOFF_EXCHANGE_FAILED", `http_${res.status}`);
        setError(
          "Workspace handoff failed. Open HouzzatPro and sign in again.",
        );
        return;
      }
      const data = (await res.json().catch(() => null)) as {
        destination?: string;
      } | null;
      const destination = data?.destination;
      // Fail closed: never default to /pro — that left authenticated users stuck.
      if (!isStaffRoleDestination(destination)) {
        recordMobileDiagEvent(
          "HANDOFF_EXCHANGE_FAILED",
          "missing_staff_destination",
        );
        setError(
          "Workspace handoff failed. Open HouzzatPro and sign in again.",
        );
        return;
      }
      recordMobileDiagEvent("HANDOFF_EXCHANGE_SUCCESS", destination);
      recordMobileDiagEvent("TENANT_SESSION_FOUND");
      if (destination === "/admin") {
        recordMobileDiagEvent("DESTINATION_ADMIN");
      } else {
        recordMobileDiagEvent("DESTINATION_AGENT");
      }
      // Do not history.replaceState after navigation — it can cancel hardGo.
      hardGo(destination);
    })();
  }, [code]);

  if (!code) {
    return (
      <p className="text-sm font-medium text-ink/60">
        Missing workspace handoff code.
      </p>
    );
  }

  if (error) {
    return <p className="text-sm font-medium text-danger">{error}</p>;
  }

  return (
    <p className="text-sm font-medium text-ink/50">
      Connecting to your workspace…
    </p>
  );
}

export function ProMobileHandoffExchange() {
  return (
    <Suspense
      fallback={
        <p className="text-sm font-medium text-ink/50">Connecting…</p>
      }
    >
      <HandoffExchangeInner />
    </Suspense>
  );
}
