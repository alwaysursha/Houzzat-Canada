import { Suspense } from "react";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { SearchExperience } from "@/components/listings/SearchExperience";

export const metadata = { title: "Search · Admin HQ" };

/**
 * Staff MLS search inside Admin HQ — same engine as public /search,
 * but stays in the admin shell (HouzzatPro policy: no public-site jump).
 */
export default function AdminSearchPage() {
  return (
    <div className="-mx-3 flex h-[calc(100dvh-7.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] flex-col overflow-hidden bg-mist sm:-mx-5 lg:-mx-8 lg:h-[calc(100dvh-5.5rem)]">
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
