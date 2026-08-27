import type { Metadata } from "next";
import { Suspense } from "react";
import { ProShellRuntimeDiagnostic } from "@/components/mobile/ProShellRuntimeDiagnostic";

export const metadata: Metadata = {
  title: "Mobile Diagnostics — HouzzatPro",
  robots: { index: false, follow: false },
};

/**
 * Full-page mobile diagnostic (Stage 3K.5.10.4).
 * Prefer /pro?diag=1 overlay; this path is a bookmarkable fallback.
 */
export default function ProMobileDiagPage() {
  return (
    <main className="mx-auto min-h-[70dvh] w-full max-w-lg px-4 py-8">
      <h1 className="text-lg font-semibold text-ink">Mobile diagnostics</h1>
      <p className="mt-2 text-sm text-ink/60">
        Safe runtime snapshot for HouzzatPRO A/B login tracing. No secrets.
        Open from the native app.
      </p>
      <div className="mt-6">
        <Suspense fallback={<p className="text-sm text-ink/50">Loading…</p>}>
          <ProShellRuntimeDiagnostic forceEnabled />
        </Suspense>
      </div>
    </main>
  );
}
