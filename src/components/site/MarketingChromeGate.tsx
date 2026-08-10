"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";

/** Hide site chrome when a listing is shown inside the Capacitor sheet iframe. */
export function MarketingChromeGate({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  if (params.get("sheet") === "1") return null;
  return children;
}
