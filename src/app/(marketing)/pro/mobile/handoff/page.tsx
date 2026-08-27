import type { Metadata } from "next";
import { ProMobileHandoffExchange } from "@/components/mobile/ProMobileHandoffExchange";

export const metadata: Metadata = {
  title: "Connecting — HouzzatPro",
  robots: { index: false, follow: false },
};

/** Tenant-host workspace session handoff exchange (one-time code). */
export default function ProMobileHandoffPage() {
  return (
    <main className="mx-auto flex min-h-[50dvh] w-full max-w-md flex-col items-center justify-center px-5 py-16 text-center">
      <ProMobileHandoffExchange />
    </main>
  );
}
