"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { persistUtm } from "@/components/ads/UtmCapture";
import { readUtmFromSearchParams } from "@/lib/ads/utm";
import { mlsNumberFromListingPath } from "@/lib/listings/listing-path";

const VISITOR_KEY = "houzzat:visitorKey";
const SESSION_KEY = "houzzat:sessionKey";
const HEARTBEAT_MS = 45_000;

function readUtm() {
  try {
    const raw = sessionStorage.getItem("houzzat_utm");
    if (!raw) return {};
    return JSON.parse(raw) as {
      utmSource?: string;
      utmMedium?: string;
      utmCampaign?: string;
      utmContent?: string;
      utmTerm?: string;
    };
  } catch {
    return {};
  }
}

function ensureId(storage: Storage, key: string) {
  let value = storage.getItem(key);
  if (!value) {
    value =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `v_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    storage.setItem(key, value);
  }
  return value;
}

function detectType(path: string): string {
  if (path.startsWith("/listing/")) return "LISTING_VIEW";
  if (path.startsWith("/lp/")) return "LANDING_VIEW";
  if (path.startsWith("/search")) return "SEARCH";
  return "PAGE_VIEW";
}

async function sendBeacon(payload: Record<string, unknown>) {
  try {
    await fetch("/api/analytics/beacon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // Non-blocking analytics.
  }
}

/**
 * Anonymous + authenticated journey tracking for Admin HQ.
 * Skips /admin and /agent staff surfaces.
 */
export function ActivityBeacon() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/admin") || pathname.startsWith("/agent")) return;

    const visitorKey = ensureId(localStorage, VISITOR_KEY);
    const sessionKey = ensureId(sessionStorage, SESSION_KEY);
    const query = searchParams?.toString();
    const path = query ? `${pathname}?${query}` : pathname;
    const fromUrl = searchParams
      ? readUtmFromSearchParams(searchParams)
      : {};
    if (fromUrl.utmSource || fromUrl.utmCampaign) {
      persistUtm(fromUrl);
    }
    const stored = readUtm();
    const utm = {
      utmSource: fromUrl.utmSource ?? stored.utmSource,
      utmMedium: fromUrl.utmMedium ?? stored.utmMedium,
      utmCampaign: fromUrl.utmCampaign ?? stored.utmCampaign,
      utmContent: fromUrl.utmContent ?? stored.utmContent,
      utmTerm: stored.utmTerm,
    };
    const type = detectType(pathname);
    const mlsNumber = mlsNumberFromListingPath(pathname);

    if (lastPathRef.current === path) return;
    lastPathRef.current = path;

    void sendBeacon({
      visitorKey,
      sessionKey,
      type,
      path,
      title: typeof document !== "undefined" ? document.title : null,
      mlsNumber,
      referrer: typeof document !== "undefined" ? document.referrer : null,
      utmSource: utm.utmSource ?? null,
      utmMedium: utm.utmMedium ?? null,
      utmCampaign: utm.utmCampaign ?? null,
      utmContent: utm.utmContent ?? null,
      utmTerm: utm.utmTerm ?? null,
    });
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/admin") || pathname.startsWith("/agent")) return;

    const tick = () => {
      const visitorKey = localStorage.getItem(VISITOR_KEY);
      const sessionKey = sessionStorage.getItem(SESSION_KEY);
      if (!visitorKey || !sessionKey) return;
      void sendBeacon({
        visitorKey,
        sessionKey,
        type: "HEARTBEAT",
        path: pathname,
      });
    };

    const id = window.setInterval(tick, HEARTBEAT_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pathname]);

  return null;
}
