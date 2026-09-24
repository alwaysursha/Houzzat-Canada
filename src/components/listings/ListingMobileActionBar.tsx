"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CalendarDays, Search } from "lucide-react";
import { WatchAreaButton } from "@/components/account/WatchAreaButton";
import { useWatchListingToggle } from "@/components/account/useWatchListingToggle";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { useClientToolsVerification } from "@/components/auth/ClientToolsVerificationProvider";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { RouteStartIcon } from "@/components/icons/RouteStartIcon";
import { useListingContactDefaults } from "@/components/listings/ListingAccountChromeProvider";
import {
  ViewingBookingModal,
  type ViewingContactDefaults,
} from "@/components/listings/ViewingBookingModal";
import { useRoutePlanner } from "@/components/route-planner/RoutePlannerProvider";
import { useClientAccess } from "@/hooks/use-client-access";
import { Button } from "@/components/ui/button";
import { flyRouteToPlanner } from "@/lib/fly-to-route-planner";
import { SITE_MESSAGES } from "@/lib/site-messages";
import { cn } from "@/lib/utils";

/**
 * Mobile-only sticky bottom actions for listing detail.
 * Active: watchlist + book viewing.
 * Inactive (sold/leased/off-market): watch area + find similar.
 */
export function ListingMobileActionBar({
  mlsNumber,
  callbackPath,
  initiallyWatching,
  signedIn,
  contact,
  inactive = false,
  similarHomesHref,
  city,
  community,
  transactionType,
  segment,
}: {
  mlsNumber: string;
  /** Canonical SEO path for auth redirects. */
  callbackPath?: string;
  initiallyWatching: boolean;
  signedIn: boolean;
  contact?: ViewingContactDefaults;
  inactive?: boolean;
  similarHomesHref?: string;
  city?: string;
  community?: string | null;
  transactionType?: "SALE" | "LEASE";
  segment?: "RESIDENTIAL" | "COMMERCIAL" | "PRE_CONSTRUCTION" | string;
}) {
  const { openAuth } = useAuthModal();
  const { toast } = useSiteAlert();
  const access = useClientAccess();
  const { openClientToolsVerification } = useClientToolsVerification();
  const resolvedContact = useListingContactDefaults(contact);
  const routePlanner = useRoutePlanner();
  const onTour = routePlanner?.isOnTour(mlsNumber) ?? false;
  const routeButtonRef = useRef<HTMLButtonElement>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [hasBottomNav, setHasBottomNav] = useState(false);
  const authCallbackUrl = callbackPath ?? `/listing/${mlsNumber}`;
  const {
    watching,
    pending: watchPending,
    ready: watchReady,
    toggle: toggleWatch,
  } = useWatchListingToggle({
    mlsNumber,
    initiallyWatching,
    authCallbackUrl,
  });

  useEffect(() => {
    function sync() {
      setHasBottomNav(
        document.documentElement.dataset.mobileBottomNav === "1",
      );
    }
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-mobile-bottom-nav"],
    });
    return () => mo.disconnect();
  }, []);

  const similarHref =
    similarHomesHref ??
    `/search?status=ACTIVE&city=${encodeURIComponent(city ?? "")}`;
  const watchSegment =
    segment === "COMMERCIAL" ? "COMMERCIAL" : ("RESIDENTIAL" as const);

  return (
    <>
      <div
        className={cn(
          // Above section nav (z-34); below mobile bottom nav (z-57) and sheet chrome (z-50).
          "fixed inset-x-0 z-[46] md:hidden",
          "bottom-[var(--mobile-bottom-nav,0px)]",
          "border-t border-line/80 bg-surface/95 shadow-[0_-8px_24px_-12px_rgba(20,32,28,0.18)] backdrop-blur-md",
          "pt-3",
          // Sheet / edge-to-edge: --listing-action-pad-bottom clears system nav.
          // With site bottom nav, that nav already includes safe-area.
          hasBottomNav
            ? "pb-3"
            : "pb-[var(--listing-action-pad-bottom)]",
        )}
      >
        <div className="flex items-center gap-2 px-3">
          {inactive ? (
            <>
              {city ? (
                <WatchAreaButton
                  city={city}
                  community={community ?? undefined}
                  transactionType={transactionType ?? "SALE"}
                  segment={watchSegment}
                  signedIn={signedIn}
                  idleLabel="Watch this area"
                  activeLabel="Area watched"
                  authCallbackUrl={authCallbackUrl}
                  className="h-12 min-w-0 flex-1 gap-1.5 px-2.5 text-sm"
                />
              ) : null}
              <Link
                href={similarHref}
                className="inline-flex h-12 min-w-0 flex-[1.45] items-center justify-center gap-1.5 rounded-lg bg-canopy px-3.5 text-sm font-semibold text-white transition hover:bg-canopy-deep"
              >
                <Search className="size-4 shrink-0" aria-hidden />
                <span className="whitespace-nowrap">Find similar homes</span>
              </Link>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                disabled={watchPending || !watchReady}
                data-houzzat-listing-coach="watchlist"
                onClick={() => void toggleWatch()}
                className={cn(
                  "h-12 min-w-0 flex-1 gap-1.5 px-2 text-sm",
                  watching && "border-signal text-signal",
                )}
              >
                <Bell
                  className={cn(
                    "size-4 shrink-0",
                    watching && "fill-signal text-signal",
                  )}
                />
                <span className="whitespace-nowrap">
                  {watching ? "Watching" : "Watchlist"}
                </span>
              </Button>
              <Button
                ref={routeButtonRef}
                type="button"
                variant="secondary"
                size="lg"
                data-houzzat-listing-coach="route"
                className={cn(
                  "h-12 shrink-0 gap-1.5 px-3 text-sm text-canopy",
                  onTour && "border-canopy",
                )}
                onClick={() => {
                  void (async () => {
                    if (access.needsEmailVerification) {
                      openClientToolsVerification({
                        callbackUrl: authCallbackUrl,
                      });
                      return;
                    }
                    if (!routePlanner) return;
                    let result: Awaited<
                      ReturnType<typeof routePlanner.toggleStop>
                    >;
                    try {
                      result = await routePlanner.toggleStop(mlsNumber);
                    } catch {
                      toast({
                        message: SITE_MESSAGES.genericErrorToast,
                        tone: "error",
                      });
                      return;
                    }
                    if (!result.ok) {
                      if (result.requiresEmailVerification) {
                        openClientToolsVerification({
                          callbackUrl: authCallbackUrl,
                        });
                        return;
                      }
                      toast({
                        message:
                          result.error ?? SITE_MESSAGES.genericErrorToast,
                        tone: "error",
                      });
                      return;
                    }
                    if (result.added) {
                      toast({
                        message: SITE_MESSAGES.routePlannerAddedToast,
                        tone: "success",
                      });
                      if (routeButtonRef.current) {
                        const el = routeButtonRef.current;
                        requestAnimationFrame(() => {
                          requestAnimationFrame(() => flyRouteToPlanner(el));
                        });
                      }
                      return;
                    }
                    toast({
                      message: SITE_MESSAGES.routePlannerRemovedToast,
                      tone: "info",
                    });
                  })();
                }}
                aria-label={
                  onTour ? "Remove from Route Planner" : "Add to Route Planner"
                }
              >
                <RouteStartIcon />
                <span className="sr-only sm:not-sr-only sm:inline">Route</span>
              </Button>
              <Button
                type="button"
                size="lg"
                className="h-12 min-w-0 flex-[1.45] gap-1.5 px-3.5 text-sm"
                onClick={() => {
                  if (!signedIn) {
                    openAuth({
                      mode: "sign-in",
                      callbackUrl: authCallbackUrl,
                    });
                    return;
                  }
                  setBookingOpen(true);
                }}
              >
                <CalendarDays className="size-4 shrink-0" />
                <span className="whitespace-nowrap">Book a viewing</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {!inactive ? (
        <ViewingBookingModal
          open={bookingOpen}
          onClose={() => setBookingOpen(false)}
          mlsNumber={mlsNumber}
          contact={resolvedContact}
        />
      ) : null}
    </>
  );
}
