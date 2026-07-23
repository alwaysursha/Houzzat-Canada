import { Suspense } from "react";
import Link from "next/link";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { HomeValuationForm } from "@/components/valuation/HomeValuationForm";

export const metadata = { title: "Home valuation" };

export default function HomeValuationPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-12 sm:px-6">
      <div>
        <h1 className="font-display text-4xl text-ink">Home valuation</h1>
        <p className="mt-2 text-ink/70">
          Get a rough estimated value from nearby market activity, then book an
          appointment for a precise valuation with a Houzzat agent. Also try the{" "}
          <Link href="/tools/seller-readiness" className="text-canopy">
            seller readiness checklist
          </Link>
          .
        </p>
      </div>
      <Suspense
        fallback={
          <div className="rounded-2xl border border-line bg-surface p-6 text-sm text-ink/50">
            Loading valuation…
          </div>
        }
      >
        <HomeValuationForm />
      </Suspense>
      <MlsDisclaimer />
    </div>
  );
}
