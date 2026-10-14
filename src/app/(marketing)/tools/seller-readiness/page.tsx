import Link from "next/link";
import { SellerReadinessForm } from "@/components/tools/SellerReadinessForm";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { readTurnstileSiteKey } from "@/lib/platform/public/turnstile-verify";

export const metadata = { title: "Seller readiness" };

export default function SellerReadinessPage() {
  const turnstileSiteKey = readTurnstileSiteKey();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-12 sm:px-6">
      <div>
        <h1 className="font-display text-4xl text-ink">Seller readiness</h1>
        <p className="mt-2 text-ink/70">
          Score your launch checklist, then get a follow-up plan. Pair with a{" "}
          <Link href="/home-valuation" className="text-canopy">
            home valuation
          </Link>
          .
        </p>
      </div>
      <SellerReadinessForm turnstileSiteKey={turnstileSiteKey} />
      <MlsDisclaimer />
    </div>
  );
}
