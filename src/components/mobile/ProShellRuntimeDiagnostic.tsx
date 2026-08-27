"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Capacitor } from "@capacitor/core";
import { useSearchParams } from "next/navigation";

type DiagState = {
  origin: string;
  href: string;
  pathname: string;
  native: boolean;
  platform: string;
  userAgent: string;
  role: string | null;
};

/**
 * Safe native-shell diagnostic (?diag=1 on /pro). No cookies, tokens, or emails.
 */
export function ProShellRuntimeDiagnostic() {
  const searchParams = useSearchParams();
  const enabled = searchParams.get("diag") === "1";
  const { data } = useSession();
  const [diag, setDiag] = useState<DiagState | null>(null);

  useEffect(() => {
    if (!enabled) return;
    setDiag({
      origin: window.location.origin,
      href: window.location.href.split("#")[0] ?? window.location.href,
      pathname: window.location.pathname,
      native: Capacitor.isNativePlatform(),
      platform: Capacitor.getPlatform(),
      userAgent: navigator.userAgent,
      role: data?.user?.role ?? null,
    });
  }, [enabled, data?.user?.role]);

  if (!enabled || !diag) return null;

  return (
    <aside
      aria-label="Pro shell runtime diagnostic"
      className="fixed bottom-0 left-0 right-0 z-[9999] max-h-[40dvh] overflow-auto border-t border-amber-300 bg-amber-50 px-3 py-2 font-mono text-[10px] leading-snug text-amber-950"
    >
      <p className="font-semibold">Pro shell diag (no secrets)</p>
      <p>origin: {diag.origin}</p>
      <p>href: {diag.href}</p>
      <p>pathname: {diag.pathname}</p>
      <p>native: {String(diag.native)}</p>
      <p>platform: {diag.platform}</p>
      <p>role: {diag.role ?? "(none)"}</p>
      <p className="break-all">ua: {diag.userAgent}</p>
    </aside>
  );
}
