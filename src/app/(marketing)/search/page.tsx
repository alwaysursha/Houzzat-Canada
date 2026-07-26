import { Suspense } from "react";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { SearchExperience } from "@/components/listings/SearchExperience";

export const metadata = { title: "Search" };

export default function SearchPage() {
  return (
    <div className="flex h-[calc(100dvh-var(--site-header-stack,4rem))] flex-col overflow-hidden bg-mist">
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
