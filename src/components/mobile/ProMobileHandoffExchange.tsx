"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ProWorkspaceTransition } from "@/components/mobile/ProWorkspaceTransition";
import { hardGo } from "@/lib/mobile/nav-back";
import {
  recordMobileDiagEvent,
  recordMobileDiagNav,
} from "@/lib/mobile/runtime-diagnostic";
import {
  setNativeNavStage,
  clearNativeNavStage,
} from "@/lib/mobile/native-route-latch";

function isStaffRoleDestination(
  value: string | null | undefined,
): value is "/admin" | "/agent" {
  return value === "/admin" || value === "/agent";
}

let inFlightExchangeCode: string | null = null;

function HandoffExchangeInner() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Prevent React StrictMode double-invocation or duplicate component mounts
    if (started.current || !code || inFlightExchangeCode === code) return;
    started.current = true;
    inFlightExchangeCode = code;
    recordMobileDiagNav();
    recordMobileDiagEvent("HANDOFF_EXCHANGE_START");

    void (async () => {
      try {
        const res = await fetch("/api/mobile/workspace-handoff", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ code }),
        });
        if (!res.ok) {
          inFlightExchangeCode = null;
          clearNativeNavStage();
          const errJson = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          const errDetail = errJson?.error ?? `http_${res.status}`;
          recordMobileDiagEvent("HANDOFF_EXCHANGE_FAILED", errDetail);
          setError(
            `Workspace handoff failed (${errDetail}). Open HouzzatPro and sign in again.`,
          );
          return;
        }
        const data = (await res.json().catch(() => null)) as {
          destination?: string;
        } | null;
        const destination = data?.destination;
        if (!isStaffRoleDestination(destination)) {
          inFlightExchangeCode = null;
          clearNativeNavStage();
          recordMobileDiagEvent(
            "HANDOFF_EXCHANGE_FAILED",
            "missing_staff_destination",
          );
          setError(
            "Workspace handoff failed. Open HouzzatPro and sign in again.",
          );
          return;
        }
        setNativeNavStage("FINAL_DESTINATION");
        recordMobileDiagEvent("HANDOFF_EXCHANGE_SUCCESS", destination);
        recordMobileDiagEvent("TENANT_SESSION_FOUND");
        if (destination === "/admin") {
          recordMobileDiagEvent("DESTINATION_ADMIN");
        } else {
          recordMobileDiagEvent("DESTINATION_AGENT");
        }
        hardGo(destination);
      } catch (e) {
        inFlightExchangeCode = null;
        clearNativeNavStage();
        const msg = e instanceof Error ? e.message : "network_error";
        recordMobileDiagEvent("HANDOFF_EXCHANGE_FAILED", msg);
        setError(`Workspace handoff failed (${msg}). Open HouzzatPro and sign in again.`);
      }
    })();
  }, [code]);

  if (!code) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-5 text-center">
        <p className="text-sm font-medium text-ink/60">
          Missing workspace handoff code.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-[999999] flex h-dvh w-full flex-col items-center justify-center bg-white px-6 text-center">
        <p className="text-sm font-semibold text-danger">{error}</p>
      </div>
    );
  }

  return <ProWorkspaceTransition />;
}

export function ProMobileHandoffExchange() {
  return (
    <Suspense fallback={<ProWorkspaceTransition />}>
      <HandoffExchangeInner />
    </Suspense>
  );
}
