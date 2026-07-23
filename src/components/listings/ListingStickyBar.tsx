"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { SaveListingButton } from "@/components/account/SaveListingButton";
import { WatchAreaButton } from "@/components/account/WatchAreaButton";
import { WatchListingButton } from "@/components/account/WatchListingButton";
import { cn } from "@/lib/utils";

type Crumb = {
  label: string;
  href?: string;
};

export function ListingStickyBar({
  crumbs,
  mlsNumber,
  initiallySaved,
  initiallyWatching,
  signedIn,
  city,
  community,
  transactionType,
  segment,
}: {
  crumbs: Crumb[];
  mlsNumber: string;
  initiallySaved: boolean;
  initiallyWatching: boolean;
  signedIn: boolean;
  city: string;
  community?: string | null;
  transactionType: "SALE" | "LEASE";
  segment?: "RESIDENTIAL" | "COMMERCIAL" | "PRE_CONSTRUCTION" | string;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setStuck(!entry?.isIntersecting);
      },
      { rootMargin: "-64px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
  }, [stuck]);

  const watchSegment =
    segment === "COMMERCIAL"
      ? "COMMERCIAL"
      : ("RESIDENTIAL" as const);

  return (
    <>
      <div ref={sentinelRef} className="h-0 w-full" aria-hidden />
      <div
        ref={barRef}
        className={cn(
          "sticky top-16 z-30 -mx-4 transition-[box-shadow,background-color,border-color] duration-300 sm:-mx-6 lg:-mx-10",
          stuck
            ? "border-b border-canopy/20 bg-mist/95 shadow-[0_8px_24px_-12px_rgba(15,107,76,0.35)] backdrop-blur-md"
            : "border-b border-transparent bg-transparent",
        )}
      >
        <div
          className={cn(
            "mx-auto w-full px-4 transition-[padding] duration-300 sm:px-6 lg:px-10",
            stuck ? "py-2.5" : "py-0",
          )}
        >
          <section
            className={cn(
              "rounded-2xl border px-4 py-3 transition duration-300 sm:px-5",
              stuck
                ? "border-canopy/25 bg-surface/95"
                : "border-canopy/15 bg-surface",
            )}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
              <nav
                aria-label="Listing location"
                className="min-w-0 overflow-hidden"
              >
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

              <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
                <SaveListingButton
                  mlsNumber={mlsNumber}
                  initiallySaved={initiallySaved}
                  signedIn={signedIn}
                />
                <WatchListingButton
                  mlsNumber={mlsNumber}
                  initiallyWatching={initiallyWatching}
                  signedIn={signedIn}
                  idleLabel="Watch property"
                  activeLabel="Watching"
                />
                <WatchAreaButton
                  city={city}
                  community={community ?? undefined}
                  transactionType={transactionType}
                  segment={watchSegment}
                  signedIn={signedIn}
                  idleLabel="Watch area"
                  authCallbackUrl={`/listing/${mlsNumber}`}
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
