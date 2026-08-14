import Link from "next/link";
import { Building2 } from "lucide-react";

/**
 * Shown when the Houzzat *consumer* Capacitor app hits /admin or /agent.
 * No Neon/API — static UX only. HouzzatPro store links intentionally omitted (Phase 1).
 */
export function OpenHouzzatProInterstitial() {
  return (
    <main className="mx-auto flex min-h-[70dvh] w-full max-w-md flex-col justify-center px-5 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-col items-center text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-canopy/15 text-canopy">
          <Building2 className="size-7" aria-hidden />
        </span>
        <h1 className="mt-5 text-2xl font-bold tracking-tight text-ink">
          Staff tools are available in HouzzatPro
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink/70">
          Use HouzzatPro to access Admin Control and Agent CRM. This Houzzat app
          is for browsing homes and your buyer/seller account.
        </p>
        <p className="mt-4 rounded-xl bg-mist px-3 py-2 text-sm font-medium text-ink/60">
          HouzzatPro — Coming Soon
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex min-h-11 w-full max-w-xs items-center justify-center rounded-lg bg-canopy px-5 text-base font-semibold text-white hover:bg-canopy-deep"
        >
          Back to Houzzat
        </Link>
      </div>
    </main>
  );
}
