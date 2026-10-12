"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { AccountVerifiedSuccessBanner } from "@/components/auth/AccountVerifiedSuccessBanner";
import { HomeCustomerToolsStrip } from "@/components/home/HomeCustomerToolsStrip";
import { HomeCustomerToolsTease } from "@/components/home/HomeCustomerToolsTease";
import { HomeOwnerListingRail } from "@/components/home/HomeOwnerListingRail";
import { HomeRecentlyViewedRail } from "@/components/home/HomeRecentlyViewedRail";
import { HomepageMarketRails } from "@/components/home/HomepageMarketRails";
import { HomepageSortedRails } from "@/components/home/HomepageSortedRails";
import type { HomeCustomerShellPayload } from "@/lib/home/load-home-customer-shell";
import { EMAIL_VERIFIED_EVENT } from "@/lib/auth/verification-success-signal";
import { scheduleAfterFirstPaint } from "@/lib/mobile/schedule-idle";

function ToolsStripSkeleton() {
  return (
    // Desktop-only — same as settled HomeCustomerToolsStrip (avoids post-login height flash).
    <div
      className="hidden md:block"
      aria-busy="true"
      aria-label="Loading account shortcuts"
    >
      <div className="border-b border-line/80 bg-surface px-4 py-3 sm:px-6 lg:px-10">
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className="h-9 w-28 shrink-0 animate-pulse rounded-lg bg-mist"
            />
          ))}
        </div>
      </div>
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

/**
 * SSR / first paint: guest/IDX shell (cacheable) including market rails.
 * Session / home-shell run in parallel and only swap tools + customer rails.
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

    // Tools/personalization shortly after hero — not on the critical first paint.
    const cancelSchedule = scheduleAfterFirstPaint(
      () => {
        if (!cancelled) void load();
      },
      { timeoutMs: 700 },
    );

    return () => {
      cancelled = true;
      cancelSchedule();
      controller.abort();
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    const controller = new AbortController();

    async function reloadShell() {
      try {
        const res = await fetch("/api/account/home-shell", {
          signal: controller.signal,
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const payload = (await res.json()) as HomeCustomerShellPayload;
        if (!cancelled) {
          setShell(payload);
          setFailed(false);
        }
      } catch {
        // ignore — existing shell stays visible
      }
    }

    const onReload = () => {
      void reloadShell();
    };
    window.addEventListener(EMAIL_VERIFIED_EVENT, onReload);
    window.addEventListener(
      "houzzat:homepage-personalization-changed",
      onReload,
    );
    return () => {
      cancelled = true;
      controller.abort();
      window.removeEventListener(EMAIL_VERIFIED_EVENT, onReload);
      window.removeEventListener(
        "houzzat:homepage-personalization-changed",
        onReload,
      );
    };
  }, [isAuthenticated]);

  const contentPad =
    "w-full space-y-10 px-4 py-6 sm:space-y-16 sm:px-6 sm:py-10 lg:px-10";

  const awaitingAccountShell =
    mounted &&
    cookieHint &&
    (status === "loading" || (isAuthenticated && !shell && !failed));

  const resolved = shell ?? guestFallback(vowOnlyGuest);

  const showToolsSkeleton =
    awaitingAccountShell && (status === "loading" || isCustomerRole);
  const guestRecent = !mounted || !isAuthenticated;

  return (
    <>
      <AccountVerifiedSuccessBanner />
      {showToolsSkeleton ? (
        <ToolsStripSkeleton />
      ) : resolved.isCustomer && resolved.tools ? (
        <HomeCustomerToolsStrip
          savedCount={resolved.tools.savedCount}
          noteCount={resolved.tools.noteCount}
          propertyWatchCount={resolved.tools.propertyWatchCount}
          areaWatchCount={resolved.tools.areaWatchCount}
          unreadAlerts={resolved.tools.unreadAlerts}
          cities={cities}
        />
      ) : (
        <div className="hidden sm:block">
          <HomeCustomerToolsTease />
        </div>
      )}
      <div className={contentPad}>
        <HomepageSortedRails
          reorderEmptyLast={resolved.personalized}
          personalization={resolved.personalization}
          cities={cities}
          sections={[
            // While home-shell loads after sign-in, keep the guest local-fallback
            // rail (null when empty) — do not mount a tall loading skeleton that
            // inflates document height during fly-to-account.
            ...(awaitingAccountShell ||
            guestRecent ||
            resolved.recentlyViewed.length > 0 ||
            resolved.personalized
              ? [
                  {
                    id: "recently-viewed",
                    resultCount:
                      awaitingAccountShell || guestRecent
                        ? 1
                        : resolved.recentlyViewed.length,
                    node: (
                      <HomeRecentlyViewedRail
                        items={
                          awaitingAccountShell ? [] : resolved.recentlyViewed
                        }
                        useLocalFallback={Boolean(
                          awaitingAccountShell || guestRecent,
                        )}
                        emptyLabel={
                          !awaitingAccountShell && resolved.personalized
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
                  isClient={resolved.isClient}
                  needsEmailVerification={resolved.needsEmailVerification}
                  vowOnlyGuest={resolved.vowOnlyGuest}
                  personalization={resolved.personalization}
                />
              ),
            },
            ...(resolved.ownerListings.length > 0 || resolved.personalized
              ? [
                  {
                    id: "owner",
                    resultCount: resolved.ownerListings.length,
                    node: (
                      <HomeOwnerListingRail
                        items={resolved.ownerListings}
                        emptyLabel={
                          resolved.personalized
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
        {children}
      </div>
    </>
  );
}
