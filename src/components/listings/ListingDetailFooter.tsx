"use client";

import type { MouseEvent } from "react";
import { MlsDisclaimer } from "@/components/compliance/MlsDisclaimer";
import { SiteFooter } from "@/components/site/SiteFooter";
import { interceptListingSheetExitClick } from "@/lib/listings/navigate-listing";
import { cn } from "@/lib/utils";

/**
 * End-of-listing trust + Houzzat footer block.
 * Lives inside the listing scroll container (never fixed).
 *
 * - Full `/listing/...`: compliance only — layout already renders SiteFooter
 *   (+ SeoFooterLinks) once via MarketingBelowHeader.
 * - Sheet / panel / iframe (`isListingSheet`): compliance + embedded SiteFooter
 *   so the overlay still ends with the same Houzzat product footer.
 */
export function ListingDetailFooter({
  isListingSheet,
  className,
}: {
  isListingSheet: boolean;
  className?: string;
}) {
  function onNavClickCapture(event: MouseEvent<HTMLElement>) {
    if (!isListingSheet) return;
    const anchor = (event.target as Element | null)?.closest?.("a");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("tel:") || href.startsWith("mailto:")) return;
    interceptListingSheetExitClick(
      event as unknown as MouseEvent<HTMLAnchorElement>,
      href,
    );
  }

  return (
    <div
      className={cn(
        "space-y-6 border-t border-line/60 pt-8",
        // Bleed to the listing page padding edges so the footer matches site width.
        "-mx-4 sm:-mx-6 lg:-mx-10",
        className,
      )}
      onClickCapture={onNavClickCapture}
    >
      <div className="px-4 sm:px-6 lg:px-10">
        <MlsDisclaimer />
      </div>
      {isListingSheet ? <SiteFooter embedded /> : null}
    </div>
  );
}
