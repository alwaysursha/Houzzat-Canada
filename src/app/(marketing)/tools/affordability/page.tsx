import { AffordabilityCalculator } from "@/components/tools/AffordabilityCalculator";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";

export const metadata = { title: "Affordability calculator" };

export default function AffordabilityPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-12 sm:px-6">
      <div>
        <h1 className="font-display text-4xl text-ink">Affordability</h1>
        <p className="mt-2 max-w-2xl text-ink/70">
          A quick GDS-style estimate to size your search — not a lender
          pre-approval.
        </p>
      </div>
      <AffordabilityCalculator />
      <MlsDisclaimer />
    </div>
  );
}
