"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { HomeCustomerToolsStrip } from "@/components/home/HomeCustomerToolsStrip";
import { HomeCustomerToolsTease } from "@/components/home/HomeCustomerToolsTease";
import { HomeOwnerListingRail } from "@/components/home/HomeOwnerListingRail";
import { HomeRecentlyViewedRail } from "@/components/home/HomeRecentlyViewedRail";
import { HomepageMarketRails } from "@/components/home/HomepageMarketRails";
import { HomepageSortedRails } from "@/components/home/HomepageSortedRails";
import { FreeSwipeRail } from "@/components/home/FreeSwipeRail";
import type { HomeCustomerShellPayload } from "@/lib/home/load-home-customer-shell";

function ToolsStripSkeleton() {
  return (
    <div
      className="border-b border-line/80 bg-surface px-4 py-3 sm:px-6 lg:px-10"
      aria-busy="true"
      aria-label="Loading account shortcuts"
    >
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="h-9 w-28 shrink-0 animate-pulse rounded-lg bg-mist"
          />
        ))}
      </div>
    </div>
  );
}

function RailsSkeleton() {
  return (
    <div className="space-y-10 sm:space-y-16" aria-busy="true">
      {Array.from({ length: 2 }, (_, section) => (
        <section key={section} className="space-y-5">
          <div className="h-8 w-48 animate-pulse rounded bg-mist" />
          <FreeSwipeRail label="Loading listings">
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl border border-line bg-surface"
              >
                <div className="aspect-[4/3] animate-pulse bg-mist" />
                <div className="space-y-2 p-3">
                  <div className="h-4 w-[66%] animate-pulse rounded bg-mist" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-mist" />
                </div>
              </div>
            ))}
          </FreeSwipeRail>
        </section>
      ))}
    </div>
  );
}

function guestFallback(vowOnlyGuest: boolean): HomeCustomerShellPayload {
  return {
    isCustomer: false,
    isClient: false,
    needsEmailVerification: false,
    vowOnlyGuest,
    personalization: null,
    personalized: false,
    tools: null,
    recentlyViewed: [],
    ownerListings: [],
  };
}

function mayHaveSessionCookie(): boolean {
  if (typeof document === "undefined") return false;
  return /(?:__Secure-|__Host-)?(?:authjs|next-auth)\.session-token/i.test(
    document.cookie,
  );
}

function SortedRailsFromShell({
  data,
  cities,
  guestRecent,
}: {
  data: HomeCustomerShellPayload;
  cities: string[];
  guestRecent?: boolean;
}) {
  return (
    <HomepageSortedRails
      reorderEmptyLast={data.personalized}
      personalization={data.personalization}
      cities={cities}
      sections={[
        ...(guestRecent ||
        data.recentlyViewed.length > 0 ||
        data.personalized
          ? [
              {
                id: "recently-viewed",
                resultCount: guestRecent ? 1 : data.recentlyViewed.length,
                node: (
                  <HomeRecentlyViewedRail
                    items={data.recentlyViewed}
                    useLocalFallback={Boolean(guestRecent)}
                    emptyLabel={
                      data.personalized
                        ? "None of your recently viewed homes match your homepage search."
                        : undefined
                    }
                  />
                ),
              },
            ]
          : []),
        {
          id: "market-rails",
          resultCount: 1,
          node: (
            <HomepageMarketRails
              isClient={data.isClient}
              needsEmailVerification={data.needsEmailVerification}
              vowOnlyGuest={data.vowOnlyGuest}
              personalization={data.personalization}
            />
          ),
        },
        ...(data.ownerListings.length > 0 || data.personalized
          ? [
              {
                id: "owner",
                resultCount: data.ownerListings.length,
                node: (
                  <HomeOwnerListingRail
                    items={data.ownerListings}
                    emptyLabel={
                      data.personalized
                        ? "No owner listings match your homepage search."
                        : undefined
                    }
                  />
                ),
              },
            ]
          : []),
      ]}
    />
  );
}

/**
 * SSR / first paint: guest/IDX shell (cacheable).
 * After mount: session cookie hint → skeletons; authenticated → home-shell.
 */
export function HomeDeferredBody({
  vowOnlyGuest = false,
  cities,
  children,
}: {
  /** Config-only VOW-only guest shell (no session). */
  vowOnlyGuest?: boolean;
  cities: string[];
  children?: ReactNode;
}) {
  const { status, data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const [cookieHint, setCookieHint] = useState(false);
  const [shell, setShell] = useState<HomeCustomerShellPayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCookieHint(mayHaveSessionCookie());
    setMounted(true);
  }, []);

  const isAuthenticated = status === "authenticated" && Boolean(session?.user);
  const role = session?.user?.role;
  const isCustomerRole =
    isAuthenticated && role !== "ADMIN" && role !== "AGENT";

  useEffect(() => {
    if (!isAuthenticated) {
      setShell(null);
      setFailed(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch("/api/account/home-shell", {
          signal: controller.signal,
          credentials: "same-origin",
        });
        if (!res.ok) {
          if (!cancelled) setFailed(true);
          return;
        }
        const payload = (await res.json()) as HomeCustomerShellPayload;
        if (!cancelled) {
          setShell(payload);
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isAuthenticated]);

  const contentPad =
    "w-full space-y-10 px-4 py-6 sm:space-y-16 sm:px-6 sm:py-10 lg:px-10";

  const guestBody = (
    <>
      <div className="hidden sm:block">
        <HomeCustomerToolsTease />
      </div>
      <div className={contentPad}>
        <SortedRailsFromShell
          data={guestFallback(vowOnlyGuest)}
          cities={cities}
          guestRecent
        />
        {children}
      </div>
    </>
  );

  const loadingBody = (showToolsSkeleton: boolean) => (
    <>
      {showToolsSkeleton ? <ToolsStripSkeleton /> : null}
      <div className={contentPad}>
        <RailsSkeleton />
        {children}
      </div>
    </>
  );

  // Match SSR HTML until mount (hydration-safe guest shell).
  if (!mounted) {
    return guestBody;
  }

  // Session cookie present / session resolving — avoid guest rails flash.
  if (
    cookieHint &&
    (status === "loading" || (isAuthenticated && !shell && !failed))
  ) {
    // While role unknown, show tools skeleton; drop it for admin/agent once known.
    return loadingBody(status === "loading" || isCustomerRole);
  }

  if (status === "loading") {
    // No cookie hint — stay on guest shell (true guests).
    return guestBody;
  }

  if (!isAuthenticated) {
    return guestBody;
  }

  if (!shell && !failed) {
    return loadingBody(isCustomerRole);
  }

  const resolved =
    shell ??
    ({
      ...guestFallback(false),
      isCustomer: isCustomerRole,
    } satisfies HomeCustomerShellPayload);

  return (
    <>
      {resolved.isCustomer && resolved.tools ? (
        <HomeCustomerToolsStrip
          savedCount={resolved.tools.savedCount}
          noteCount={resolved.tools.noteCount}
          propertyWatchCount={resolved.tools.propertyWatchCount}
          areaWatchCount={resolved.tools.areaWatchCount}
          unreadAlerts={resolved.tools.unreadAlerts}
          cities={cities}
        />
      ) : null}
      <div className={contentPad}>
        <SortedRailsFromShell data={resolved} cities={cities} />
        {children}
      </div>
    </>
  );
}
