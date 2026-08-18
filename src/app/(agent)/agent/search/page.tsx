import { Suspense } from "react";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { SearchExperience } from "@/components/listings/SearchExperience";

export const metadata = { title: "Properties · CRM" };

/**
 * Staff MLS search inside the CRM shell — avoids navigating to public /search
 * (required for HouzzatPro).
 */
export default function AgentSearchPage() {
  return (
    <div className="-mx-3 flex h-[calc(100dvh-7.25rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] flex-col overflow-hidden bg-mist sm:-mx-5 lg:-mx-6 lg:h-[calc(100dvh-4.5rem)]">
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-sm text-ink/50">
            Loading search…
          </div>
        }
      >
        <SearchExperience />
      </Suspense>
      <div className="shrink-0 border-t border-line/80 bg-surface px-4 py-1.5">
        <MlsDisclaimer className="text-[10px] leading-snug text-ink/40" />
      </div>
    </div>
  );
}
