"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
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
            "z-30 -mx-4 transition-[box-shadow,background-color,border-color] duration-300 sm:-mx-6 lg:-mx-10",
            // Sheet: fixed flush under the overlay Close bar (iframe top = 0).
            // Full page: sticky under the site header stack.
            // Panel overlay sets --listing-sheet-chrome-height so this sits
            // under the green Close bar. Iframe sheet leaves it unset (0).
            isSheet
              ? "fixed inset-x-0 top-[var(--listing-sheet-chrome-height,0px)] mx-0"
              : "sticky top-[var(--site-header-stack,4rem)]",
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
            <div className="py-2">
              <ListingBreadcrumbs crumbs={crumbs} className="overflow-hidden" />
            </div>
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
