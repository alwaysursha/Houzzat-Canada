"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { hardGo } from "@/lib/mobile/nav-back";

function HandoffExchangeInner() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current || !code) return;
    started.current = true;

    void (async () => {
      const res = await fetch("/api/mobile/workspace-handoff", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        setError("Workspace sign-in expired. Open HouzzatPro and sign in again.");
        return;
      }
      const data = (await res.json()) as { destination?: string };
      const destination = data.destination ?? "/pro";
      hardGo(destination);
      if (typeof window !== "undefined") {
        const clean = new URL(window.location.href);
        clean.searchParams.delete("code");
        window.history.replaceState({}, "", clean.pathname);
      }
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
    <p className="text-sm font-medium text-ink/50">Connecting to your workspace…</p>
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
