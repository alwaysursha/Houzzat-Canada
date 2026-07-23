"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { readUtmFromSearchParams, type UtmParams } from "@/lib/ads/utm";

const STORAGE_KEY = "houzzat_utm";

export function persistUtm(utm: UtmParams) {
  if (typeof window === "undefined") return;
  if (!utm.utmSource && !utm.utmCampaign) return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(utm));
}

export function loadPersistedUtm(): UtmParams {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as UtmParams;
  } catch {
    return {};
  }
}

/** Captures UTMs from the URL into sessionStorage for later lead forms. */
export function UtmCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    persistUtm(readUtmFromSearchParams(searchParams));
  }, [searchParams]);

  return null;
}
