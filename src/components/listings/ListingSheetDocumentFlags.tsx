"use client";

import { useLayoutEffect } from "react";
import { useSearchParams } from "next/navigation";

function isFramed(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * When the listing page is inside the overlay iframe, zero the site-header
 * sticky offset and flag the document for sheet CSS (before paint when possible).
 */
export function ListingSheetDocumentFlags() {
  const params = useSearchParams();
  const sheetParam = params.get("sheet") === "1";

  useLayoutEffect(() => {
    const active = sheetParam || isFramed();
    if (!active) return;
    const root = document.documentElement;
    root.dataset.listingSheet = "1";
    root.style.setProperty("--site-header-stack", "0px");
    root.style.setProperty("--mobile-bottom-nav", "0px");
    root.dataset.mobileBottomNav = "0";
    return () => {
      delete root.dataset.listingSheet;
      root.style.removeProperty("--site-header-stack");
      root.style.removeProperty("--mobile-bottom-nav");
      delete root.dataset.mobileBottomNav;
    };
  }, [sheetParam]);

  return null;
}
