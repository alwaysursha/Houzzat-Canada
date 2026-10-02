"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { SaveListingButton } from "@/components/account/SaveListingButton";
import { WatchAreaButton } from "@/components/account/WatchAreaButton";
import { WatchListingButton } from "@/components/account/WatchListingButton";
import { ShareListingButton } from "@/components/listings/ShareListingButton";
import { interceptListingSheetExitClick } from "@/lib/listings/navigate-listing";
import { cn } from "@/lib/utils";

type Crumb = {
  label: string;
  href?: string;
};

function ListingBreadcrumbs({
  crumbs,
  className,
}: {
  crumbs: Crumb[];
  className?: string;
}) {
  return (
    <nav aria-label="Listing location" className={cn("min-w-0", className)}>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              {index > 0 ? (
                <li aria-hidden className="text-ink/30">
                  <ChevronRight className="size-3.5" />
                </li>
              ) : null}
              <li
                className={cn(
                  "min-w-0",
                  isLast && "max-w-[14rem] truncate sm:max-w-xs",
                )}
              >
                {crumb.href && !isLast ? (
                  <Link
                    href={crumb.href}
                    onClick={(event) =>
                      interceptListingSheetExitClick(event, crumb.href!)
                    }
                    className="font-medium text-canopy transition hover:text-canopy-deep hover:underline"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className={cn(
                      isLast
                        ? "font-semibold text-ink"
                        : "font-medium text-ink/55",
                    )}
                    aria-current={isLast ? "page" : undefined}
                  >
                    {crumb.label}
                  </span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

function readStickyTopPx(): number {
  if (typeof window === "undefined") return 64;
  if (document.documentElement.dataset.listingSheet === "1") return 0;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;top:var(--site-header-stack,4rem);";
  document.body.appendChild(probe);
  const px = Math.round(probe.getBoundingClientRect().top);
  probe.remove();
  return Number.isFinite(px) && px >= 0 ? px : 64;
}

export function ListingStickyBar({
  crumbs,
  mlsNumber,
  shareTitle,
  callbackPath,
  initiallySaved,
  initiallyWatching,
  signedIn,
  city,
  community,
  transactionType,
  segment,
  inactive = false,
  similarHomesHref,
  sheetMode = false,
}: {
  crumbs: Crumb[];
  mlsNumber: string;
  /** Address / label used in share text. */
  shareTitle: string;
  /** Canonical SEO path for auth redirects. */
  callbackPath?: string;
  initiallySaved: boolean;
  initiallyWatching: boolean;
  signedIn: boolean;
  city: string;
  community?: string | null;
  transactionType: "SALE" | "LEASE";
  segment?: "RESIDENTIAL" | "COMMERCIAL" | "PRE_CONSTRUCTION" | string;
  inactive?: boolean;
  similarHomesHref?: string;
  /** Listing overlay iframe (?sheet=1) — pin flush under the green Close bar. */
  sheetMode?: boolean;
}) {
  const authCallbackUrl = callbackPath ?? `/listing/${mlsNumber}`;
  const sentinelRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [isSheet, setIsSheet] = useState(sheetMode);
  const [stuck, setStuck] = useState(sheetMode);
  const [topOffset, setTopOffset] = useState(sheetMode ? 0 : 64);

  useEffect(() => {
    const sync = () => {
      let framed = false;
      try {
        framed = window.self !== window.top;
      } catch {
        framed = true;
      }
      const sheet =
        sheetMode ||
        framed ||
        document.documentElement.dataset.listingSheet === "1";
      setIsSheet(sheet);
      setTopOffset(readStickyTopPx());
    };
    sync();
    window.addEventListener("resize", sync);
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-listing-sheet", "style"],
    });
    return () => {
      window.removeEventListener("resize", sync);
      mo.disconnect();
    };
  }, [sheetMode]);

  useEffect(() => {
    // In the listing sheet, pin under the green Close bar immediately.
    if (isSheet) {
      setStuck(true);
      return;
    }

    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setStuck(!entry?.isIntersecting);
      },
      { rootMargin: `-${Math.max(0, topOffset)}px 0px 0px 0px`, threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isSheet, topOffset]);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    const publishHeight = () => {
      document.documentElement.style.setProperty(
        "--listing-sticky-bar-height",
        `${bar.offsetHeight}px`,
      );
    };

    publishHeight();
    const observer = new ResizeObserver(publishHeight);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty(
        "--listing-sticky-bar-height",
      );
    };
  }, [stuck, isSheet]);

  const watchSegment =
    segment === "COMMERCIAL" ? "COMMERCIAL" : ("RESIDENTIAL" as const);

  return (
    <>
      {/*
        Desktop sticky must stay in the page flow (not inside a short wrapper),
        otherwise position:sticky has no room to stick.
        md:contents lifts children into the parent layout on desktop.
      */}
      <div className="hidden md:contents">
        {!isSheet ? (
          <div ref={sentinelRef} className="h-0 w-full" aria-hidden />
        ) : null}
        <div
          ref={barRef}
          className={cn(
            "z-30 transition-[box-shadow,background-color,border-color] duration-300",
            // Sheet: fixed flush under the overlay Close bar (iframe top = 0).
            // Full page: sticky under the site header stack.
            // Panel overlay sets --listing-sheet-chrome-height so this sits
            // under the green Close bar. Iframe sheet leaves it unset (0).
            // Page negative margins are omitted in the sheet so the bar cannot
            // extend past the centered popup.
            isSheet
              ? "fixed inset-x-0 top-[var(--listing-sheet-chrome-height,0px)]"
              : "sticky top-[var(--site-header-stack,4rem)] -mx-4 sm:-mx-6 lg:-mx-10",
            stuck || isSheet
              ? "border-b border-canopy/20 bg-mist/95 shadow-[0_8px_24px_-12px_rgba(15,107,76,0.35)] backdrop-blur-md"
              : "border-b border-transparent bg-transparent",
          )}
        >
          <div
            className={cn(
              "mx-auto w-full px-4 transition-[padding] duration-300 sm:px-6 lg:px-10",
              stuck || isSheet ? "py-2.5" : "py-0",
            )}
          >
            <section
              className={cn(
                "border px-4 py-3 transition duration-300 sm:px-5",
                // Sheet: flush strip under Close bar (no floating card gap).
                isSheet
                  ? "rounded-none border-x-0 border-t-0 border-canopy/20 bg-surface/95"
                  : stuck
                    ? "rounded-2xl border-canopy/25 bg-surface/95"
                    : "rounded-2xl border-canopy/15 bg-surface",
              )}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
                <ListingBreadcrumbs crumbs={crumbs} className="overflow-hidden" />

                <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
                  <ShareListingButton
                    mlsNumber={mlsNumber}
                    title={shareTitle}
                    path={callbackPath}
                  />
                  <SaveListingButton
                    mlsNumber={mlsNumber}
                    initiallySaved={initiallySaved}
                    signedIn={signedIn}
                    authCallbackUrl={authCallbackUrl}
                  />
                  {inactive ? (
                    <>
                      <WatchAreaButton
                        city={city}
                        community={community ?? undefined}
                        transactionType={transactionType}
                        segment={watchSegment}
                        signedIn={signedIn}
                        idleLabel="Watch this area"
                        authCallbackUrl={authCallbackUrl}
                      />
                      {similarHomesHref ? (
                        <Link
                          href={similarHomesHref}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-canopy px-3 text-xs font-semibold text-white transition hover:bg-canopy-deep"
                        >
                          <Search className="size-3.5" aria-hidden />
                          Find similar homes
                        </Link>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <WatchListingButton
                        mlsNumber={mlsNumber}
                        initiallyWatching={initiallyWatching}
                        signedIn={signedIn}
                        idleLabel="Watch property"
                        activeLabel="Watching"
                        authCallbackUrl={authCallbackUrl}
                      />
                      <WatchAreaButton
                        city={city}
                        community={community ?? undefined}
                        transactionType={transactionType}
                        segment={watchSegment}
                        signedIn={signedIn}
                        idleLabel="Watch area"
                        authCallbackUrl={authCallbackUrl}
                      />
                    </>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
        {isSheet ? (
          <div
            className="w-full"
            style={{ height: "var(--listing-sticky-bar-height, 4.5rem)" }}
            aria-hidden
          />
        ) : null}
      </div>
    </>
  );
}
