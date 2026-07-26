"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CalendarDays, Search } from "lucide-react";
import { WatchAreaButton } from "@/components/account/WatchAreaButton";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import {
  ViewingBookingModal,
  type ViewingContactDefaults,
} from "@/components/listings/ViewingBookingModal";
import { Button } from "@/components/ui/button";
import { SITE_MESSAGES } from "@/lib/site-messages";
import { cn } from "@/lib/utils";

/**
 * Mobile-only sticky bottom actions for listing detail.
 * Active: watchlist + book viewing.
 * Inactive (sold/leased/off-market): watch area + find similar.
 */
export function ListingMobileActionBar({
  mlsNumber,
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
  const router = useRouter();
  const { openAuth } = useAuthModal();
  const { alert, confirm, toast } = useSiteAlert();
  const [watching, setWatching] = useState(initiallyWatching);
  const [pending, setPending] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);

  useEffect(() => {
    setWatching(initiallyWatching);
  }, [initiallyWatching]);

  async function onWatchProperty() {
    if (!signedIn) {
      openAuth({
        mode: "sign-in",
        callbackUrl: `/listing/${mlsNumber}`,
      });
      return;
    }

    const nextWatching = !watching;
    if (!nextWatching) {
      const ok = await confirm({
        ...SITE_MESSAGES.stopWatchingHome,
        destructive: true,
      });
      if (!ok) return;
    }

    setPending(true);
    const res = await fetch("/api/account/property-monitors", {
      method: nextWatching ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mlsNumber }),
    });
    setPending(false);
    if (!res.ok) {
      toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
      return;
    }

    setWatching(nextWatching);
    router.refresh();

    if (nextWatching) {
      await alert({ ...SITE_MESSAGES.watchAdded });
      return;
    }

    toast({ message: SITE_MESSAGES.watchRemovedToast, tone: "info" });
  }

  const similarHref =
    similarHomesHref ??
    `/search?status=ACTIVE&city=${encodeURIComponent(city ?? "")}`;
  const watchSegment =
    segment === "COMMERCIAL" ? "COMMERCIAL" : ("RESIDENTIAL" as const);

  return (
    <>
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 md:hidden",
          "border-t border-line/80 bg-surface/95 shadow-[0_-8px_24px_-12px_rgba(20,32,28,0.18)] backdrop-blur-md",
          "pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3",
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
                  authCallbackUrl={`/listing/${mlsNumber}`}
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
                disabled={pending}
                onClick={() => void onWatchProperty()}
                className={cn(
                  "h-12 min-w-0 flex-1 gap-1.5 px-2.5 text-sm",
                  watching && "border-signal text-signal",
                )}
              >
                <Bell
                  className={cn(
                    "size-4 shrink-0",
                    watching && "fill-signal text-signal",
                  )}
                />
                <span className="truncate">
                  {watching ? "Watching" : "Add to Watchlist"}
                </span>
              </Button>
              <Button
                type="button"
                size="lg"
                className="h-12 min-w-0 flex-[1.45] gap-1.5 px-3.5 text-sm"
                onClick={() => {
                  if (!signedIn) {
                    openAuth({
                      mode: "sign-in",
                      callbackUrl: `/listing/${mlsNumber}`,
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
          contact={contact}
        />
      ) : null}
    </>
  );
}
