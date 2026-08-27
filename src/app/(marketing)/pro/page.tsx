import type { Metadata } from "next";
import { Suspense } from "react";
import { HouzzatProStartup } from "@/components/mobile/HouzzatProStartup";
import { ProShellRuntimeDiagnostic } from "@/components/mobile/ProShellRuntimeDiagnostic";

export const metadata: Metadata = {
  title: "HouzzatPro",
  robots: { index: false, follow: false },
};

/**
 * Capacitor Pro cold-start surface (`server.url` → /pro).
 * Routing is handled by HouzzatProStartup in Providers (session role only).
 * Append ?diag=1 for safe native runtime origin inspection (no secrets).
 */
export default function HouzzatProStartPage() {
  return (
    <>
      <HouzzatProStartup />
      <Suspense fallback={null}>
        <ProShellRuntimeDiagnostic />
      </Suspense>
      <main className="mx-auto flex min-h-[50dvh] w-full max-w-md flex-col items-center justify-center px-5 py-16 text-center">
        <p className="text-sm font-medium text-ink/50">Opening HouzzatPro…</p>
      </main>
    </>
  );
}
