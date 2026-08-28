import type { Metadata } from "next";
import { Suspense } from "react";
import { ProMobileHandoffExchange } from "@/components/mobile/ProMobileHandoffExchange";
import { ProShellRuntimeDiagnostic } from "@/components/mobile/ProShellRuntimeDiagnostic";
import { ProWorkspaceTransition } from "@/components/mobile/ProWorkspaceTransition";

export const metadata: Metadata = {
  title: "Connecting — HouzzatPro",
  robots: { index: false, follow: false },
};

/** Tenant-host workspace session handoff exchange (one-time code). */
export default function ProMobileHandoffPage() {
  return (
    <>
      <Suspense fallback={null}>
        <ProShellRuntimeDiagnostic />
      </Suspense>
      <Suspense fallback={<ProWorkspaceTransition />}>
        <ProMobileHandoffExchange />
      </Suspense>
    </>
  );
}
