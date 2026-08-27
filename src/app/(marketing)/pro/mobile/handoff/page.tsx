import type { Metadata } from "next";
import { Suspense } from "react";
import { ProMobileHandoffExchange } from "@/components/mobile/ProMobileHandoffExchange";
import { ProShellRuntimeDiagnostic } from "@/components/mobile/ProShellRuntimeDiagnostic";

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
      <main className="mx-auto flex min-h-[50dvh] w-full max-w-md flex-col items-center justify-center px-5 py-16 text-center">
        <ProMobileHandoffExchange />
      </main>
    </>
  );
}
