"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Hide site chrome when a listing is shown inside the listing sheet iframe.
 * Also hides when framed without ?sheet=1 (soft-nav can drop the param).
 */
export function MarketingChromeGate({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  const [framed, setFramed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      setFramed(window.self !== window.top);
    } catch {
      setFramed(true);
    }
  }, []);

  if (params.get("sheet") === "1" || framed) return null;
  return children;
}
