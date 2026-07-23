"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, Heart, MapPinned, NotebookPen } from "lucide-react";
import { SavedSearchesMenuButton } from "@/components/account/SavedSearchesMenuButton";
import { cn } from "@/lib/utils";

export function HomeCustomerToolsStrip({
  savedCount,
  noteCount,
  propertyWatchCount,
  areaWatchCount,
  unreadAlerts,
}: {
  savedCount: number;
  noteCount: number;
  propertyWatchCount: number;
  areaWatchCount: number;
  unreadAlerts: number;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
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

  const stats = [
    { label: "Saved", value: savedCount, href: "/account/saved" },
    { label: "Notes", value: noteCount, href: "/account/notes" },
    {
      label: "Watching",
      value: propertyWatchCount,
      href: "/account/monitors",
    },
    {
      label: "Areas",
      value: areaWatchCount,
      href: "/account/monitors#areas",
    },
  ] as const;

  return (
    <>
      <div ref={sentinelRef} className="h-0 w-full" aria-hidden />
      <div
        className={cn(
          "sticky top-16 z-20 transition-[box-shadow,background-color,border-color] duration-300",
          stuck
            ? "border-b border-canopy/20 bg-mist shadow-[0_8px_24px_-12px_rgba(15,107,76,0.35)]"
            : "border-b border-transparent bg-transparent",
        )}
      >
        <div
          className={cn(
            "mx-auto w-full px-4 transition-[padding] duration-300 sm:px-6 lg:px-10",
            stuck ? "py-2.5" : "py-3",
          )}
        >
          <div
            className={cn(
              "relative rounded-2xl border transition duration-300",
              stuck
                ? "border-canopy/25 bg-surface shadow-none"
                : "border-canopy/15 bg-gradient-to-r from-canopy/[0.07] via-surface to-surface shadow-[0_1px_0_rgba(15,107,76,0.06)]",
            )}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l-2xl bg-canopy"
            />
            <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-lg tracking-tight text-ink">
                    Your Houzzat
                  </p>
                  {unreadAlerts > 0 ? (
                    <span className="rounded-md bg-signal/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-signal">
                      {unreadAlerts} new
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {stats.map((stat) => (
                    <Link
                      key={stat.label}
                      href={stat.href}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line/80 bg-mist/70 px-2.5 py-1 text-xs font-semibold text-ink/75 transition hover:border-canopy/40 hover:text-canopy"
                    >
                      <span className="font-display text-sm text-canopy">
                        {stat.value}
                      </span>
                      {stat.label}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <SavedSearchesMenuButton />
                <Link
                  href="/account/saved"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-canopy px-3 py-2 text-xs font-semibold text-white transition hover:bg-canopy-deep"
                >
                  <Heart className="h-3.5 w-3.5" />
                  Saved
                </Link>
                <Link
                  href="/account/notes"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink/75 transition hover:border-canopy/40 hover:text-canopy"
                >
                  <NotebookPen className="h-3.5 w-3.5" />
                  Notes
                </Link>
                <Link
                  href="/account/monitors"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink/75 transition hover:border-canopy/40 hover:text-canopy"
                >
                  <Bell className="h-3.5 w-3.5" />
                  Monitors
                </Link>
                <Link
                  href="/account/monitors#areas"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink/75 transition hover:border-canopy/40 hover:text-canopy"
                >
                  <MapPinned className="h-3.5 w-3.5" />
                  Areas
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
