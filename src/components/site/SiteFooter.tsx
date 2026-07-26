import { SITE_NAME } from "@/lib/constants";

/**
 * Keep footer transparent so the page body background (mist + soft radials)
 * shows through continuously — avoids a hard light/dark horizontal seam.
 */
export function SiteFooter() {
  return (
    <footer className="bg-transparent">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-10 text-sm text-ink/65 sm:px-6 md:flex-row md:items-center md:justify-between">
        <p className="font-display text-lg text-ink">{SITE_NAME}</p>
        <p>
          MLS® listing data coming via TRREB / PropTx. This Phase 0 shell is
          foundation only.
        </p>
      </div>
    </footer>
  );
}
