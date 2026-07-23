import { Suspense } from "react";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { SearchExperience } from "@/components/listings/SearchExperience";

export const metadata = { title: "Search" };

export default function SearchPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-display text-4xl text-ink">Search</h1>
        <p className="mt-2 max-w-2xl text-ink/70">
          Switch between Residential and Commercial inventory. Demo GTA data
          until PropTx is connected.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="rounded-2xl border border-line bg-surface p-8 text-sm text-ink/50">
            Loading search…
          </div>
        }
      >
        <SearchExperience />
      </Suspense>
      <MlsDisclaimer />
    </div>
  );
}
