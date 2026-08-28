import type { Metadata } from "next";
import { Suspense } from "react";
import { HouzzatProStartup } from "@/components/mobile/HouzzatProStartup";
import { ProShellRuntimeDiagnostic } from "@/components/mobile/ProShellRuntimeDiagnostic";
import { ProWorkspaceTransition } from "@/components/mobile/ProWorkspaceTransition";

export const metadata: Metadata = {
  title: "HouzzatPro",
  robots: { index: false, follow: false },
};

/**
 * Capacitor Pro cold-start surface (`server.url` → /pro).
 * Transition UI is owned solely by HouzzatProStartup (no stacked loading copy).
 */
export default function HouzzatProStartPage() {
  return (
    <>
      <Suspense fallback={<ProWorkspaceTransition />}>
        <HouzzatProStartup />
      </Suspense>
      <Suspense fallback={null}>
        <ProShellRuntimeDiagnostic />
      </Suspense>
    </>
  );
}
