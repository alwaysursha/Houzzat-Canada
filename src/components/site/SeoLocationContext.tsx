"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SeoFooterLocation } from "@/lib/seo/footer-links";

type SeoLocationContextValue = {
  location: SeoFooterLocation | null;
  setLocation: (next: SeoFooterLocation | null) => void;
};

const SeoLocationContext = createContext<SeoLocationContextValue | null>(null);

export function SeoLocationProvider({ children }: { children: ReactNode }) {
  const [location, setLocationState] = useState<SeoFooterLocation | null>(null);
  const setLocation = useCallback((next: SeoFooterLocation | null) => {
    setLocationState(next);
  }, []);
  const value = useMemo(
    () => ({ location, setLocation }),
    [location, setLocation],
  );
  return (
    <SeoLocationContext.Provider value={value}>
      {children}
    </SeoLocationContext.Provider>
  );
}

export function useSeoLocation() {
  return useContext(SeoLocationContext);
}

/** Server/client bridge: push page city/community into the SEO footer. */
export function SeoLocationBridge({
  city,
  community,
}: {
  city?: string | null;
  community?: string | null;
}) {
  const ctx = useSeoLocation();
  const setLocation = ctx?.setLocation;
  useEffect(() => {
    if (!setLocation) return;
    if (!city?.trim()) {
      setLocation(null);
      return;
    }
    setLocation({
      city: city.trim(),
      community: community?.trim() || null,
    });
    return () => setLocation(null);
  }, [setLocation, city, community]);
  return null;
}
