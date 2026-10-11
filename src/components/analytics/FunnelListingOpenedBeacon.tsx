"use client";

import { useEffect, useRef } from "react";
import { reportFunnelEvent } from "@/lib/funnel/browser";

/**
 * Fires listing_detail_opened once per MLS when a listing detail route mounts.
 * Distinct from card-click navigation intent.
 */
export function FunnelListingOpenedBeacon({
  mlsNumber,
}: {
  mlsNumber: string;
}) {
  const reported = useRef<string | null>(null);

  useEffect(() => {
    const mls = mlsNumber.trim().toUpperCase();
    if (!mls) return;
    if (reported.current === mls) return;
    reported.current = mls;
    reportFunnelEvent({
      eventName: "listing_detail_opened",
      mlsNumber: mls,
      meta: { source: "listing_detail", pathClass: "listing_detail" },
    });
  }, [mlsNumber]);

  return null;
}
