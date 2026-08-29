"use client";

import { useEffect, useState } from "react";
import { proNativeAuthController, type NativeAuthSnapshot } from "@/lib/mobile/pro-native-auth-controller";
import type { SafeAuthServerDiagnosticEvent } from "@/lib/auth/auth-diagnostic-buffer";

export function NativeAuthDiagnosticOverlay({
  submitCount = 0,
  lastSignInResult = null,
}: {
  submitCount?: number;
  lastSignInResult?: { ok?: boolean; error?: string | null; status?: number } | null;
}) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<NativeAuthSnapshot>(() =>
    proNativeAuthController.getSnapshot(),
  );
  const [serverDiag, setServerDiag] = useState<{
    build?: string;
    serverTimestamp?: string;
    incomingHost?: string | null;
    isPlatformHost?: boolean;
    nativeShellDetected?: boolean;
    recentEvents?: SafeAuthServerDiagnosticEvent[];
  } | null>(null);

  useEffect(() => {
    const unsub = proNativeAuthController.subscribe(setSnapshot);
    return unsub;
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/mobile/auth-diagnostic", {
          cache: "no-store",
        });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setServerDiag(data);
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, submitCount, snapshot.state]);

  const clientOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const clientPathname = typeof window !== "undefined" ? window.location.pathname : "";
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isNative =
    userAgent.includes("HouzzatNative/1") || userAgent.includes("com.houzzat.pro");
  const cookiesPresent =
    typeof document !== "undefined" && document.cookie && document.cookie.length > 0
      ? "yes"
      : "no";

  const storageKeyNames: string[] = [];
  if (typeof sessionStorage !== "undefined") {
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && (key.includes("houzzat") || key.includes("auth"))) {
          storageKeyNames.push(`session:${key}`);
        }
      }
    } catch {
      // ignore
    }
  }
  if (typeof localStorage !== "undefined") {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes("houzzat") || key.includes("auth"))) {
          storageKeyNames.push(`local:${key}`);
        }
      }
    } catch {
      // ignore
    }
  }

  const latestServerEvent = serverDiag?.recentEvents?.[0] ?? null;

  return (
    <div className="mt-4 w-full">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full rounded-lg border border-[#0B5C49]/20 bg-white/30 px-3 py-2 text-center text-xs font-semibold text-[#0B5C49] transition hover:bg-white/50"
      >
        {open ? "▲ Hide Native Auth Diagnostics" : "▼ Show Native Auth Diagnostics"}
      </button>

      {open && (
        <div className="mt-3 space-y-3 rounded-xl border border-amber-300 bg-amber-50/95 p-4 text-left font-mono text-xs text-amber-950 shadow-md backdrop-blur-sm">
          <p className="border-b border-amber-300 pb-1 font-bold uppercase tracking-wider text-amber-900">
            Physical Device Auth Proof (STAGE 3K.5.22)
          </p>

          <div className="space-y-1">
            <p className="font-semibold text-amber-900">[CLIENT-SIDE TELEMETRY]</p>
            <p>location.origin: <span className="font-normal">{clientOrigin}</span></p>
            <p>pathname: <span className="font-normal">{clientPathname}</span></p>
            <p>nativeShell: <span className="font-normal">{isNative ? "YES" : "NO"}</span></p>
            <p>formSubmitCount: <span className="font-normal">{submitCount}</span></p>
            <p>callbackPath: <span className="font-normal">/api/auth/callback/credentials</span></p>
            <p>controllerState: <span className="font-normal">{snapshot.state}</span></p>
            <p>
              signInResult:{" "}
              <span className="font-normal">
                {lastSignInResult ? JSON.stringify(lastSignInResult) : "(none yet)"}
              </span>
            </p>
            <p>documentCookiesPresent: <span className="font-normal">{cookiesPresent}</span></p>
            <p>
              storageAuthKeys:{" "}
              <span className="font-normal">
                {storageKeyNames.length > 0 ? storageKeyNames.join(", ") : "(none)"}
              </span>
            </p>
          </div>

          <div className="border-t border-amber-200 pt-2 space-y-1">
            <p className="font-semibold text-amber-900">[SERVER-SIDE EVALUATION FOR ATTEMPT]</p>
            <p>serverBuildMarker: <span className="font-normal">{serverDiag?.build ?? "loading…"}</span></p>
            <p>diagRequestId: <span className="font-bold text-amber-900">{latestServerEvent?.diagId ?? "(waiting for submission…)"}</span></p>
            <p>incomingHost: <span className="font-normal">{latestServerEvent?.incomingHost ?? serverDiag?.incomingHost ?? "(none)"}</span></p>
            <p>requestUrlHost: <span className="font-normal">{latestServerEvent?.requestUrlHost ?? "(none)"}</span></p>
            <p>resolvedAuthHost: <span className="font-normal">{latestServerEvent?.resolvedAuthHostname ?? "(none)"}</span></p>
            <p>isPlatformHost: <span className="font-normal">{latestServerEvent ? (latestServerEvent.isPlatformHost ? "YES" : "NO") : (serverDiag?.isPlatformHost ? "YES" : "NO")}</span></p>
            <p>userFound: <span className="font-normal">{latestServerEvent ? (latestServerEvent.userFound ? "YES" : "NO") : "(none)"}</span></p>
            <p>passwordMatch: <span className="font-normal">{latestServerEvent?.passwordMatch ?? "(none)"}</span></p>
            <p>tenantValidationInvoked: <span className="font-normal">{latestServerEvent ? (latestServerEvent.tenantValidationInvoked ? "YES" : "NO") : "(none)"}</span></p>
            <p>tenantValidationReason: <span className="font-normal">{latestServerEvent?.tenantValidationReason ?? "(none)"}</span></p>
            <p>authorizeResult: <span className="font-bold">{latestServerEvent?.authorizeResult ?? "(none)"}</span></p>
            <p>signInCallbackResult: <span className="font-normal">{latestServerEvent?.signInCallbackResult ?? "(none)"}</span></p>
          </div>
        </div>
      )}
    </div>
  );
}
