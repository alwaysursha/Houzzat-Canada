"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Clock3,
  Heart,
  Search,
} from "lucide-react";
import { AuthOpenButton } from "@/components/auth/AuthOpenButton";
import { cn } from "@/lib/utils";

const CAPABILITIES = [
  { icon: Heart, label: "Saved listings" },
  { icon: Search, label: "Saved searches" },
  { icon: Bell, label: "Watchlist" },
  { icon: Clock3, label: "Recently viewed" },
] as const;

export function HomeCustomerToolsTease() {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    let observer: IntersectionObserver | null = null;

    function stackPx() {
      const raw =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--site-header-stack")
          .trim() || "4rem";
      if (raw.endsWith("rem")) return parseFloat(raw) * 16;
      if (raw.endsWith("px")) return parseFloat(raw);
      return 64;
    }

    function bind() {
      observer?.disconnect();
      const px = stackPx();
      observer = new IntersectionObserver(
        ([entry]) => {
          setStuck(!entry?.isIntersecting);
        },
        { rootMargin: `-${px}px 0px 0px 0px`, threshold: 0 },
      );
      observer.observe(el!);
    }

    bind();
    const mo = new MutationObserver(bind);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "data-mobile-search-visible"],
    });
    return () => {
      mo.disconnect();
      observer?.disconnect();
    };
  }, []);

  return (
    <>
      <div ref={sentinelRef} className="h-0 w-full" aria-hidden />
      <div
        className={cn(
          "sticky top-[var(--site-header-stack,4rem)] z-20 transition-[box-shadow,background-color,border-color,top] duration-300",
          stuck
            ? "border-b border-canopy/20 bg-mist/95 pt-2 shadow-[0_8px_24px_-12px_rgba(15,107,76,0.35)] backdrop-blur-md"
            : "border-b border-transparent bg-transparent",
        )}
      >
        <div
          className={cn(
            "mx-auto w-full px-4 transition-[padding] duration-300 sm:px-6 lg:px-10",
            stuck ? "py-2.5" : "py-3",
          )}
        >
          <section
            className={cn(
              "rounded-2xl border px-4 py-3.5 transition duration-300 sm:px-5",
              stuck
                ? "border-canopy/25 bg-surface/95"
                : "border-canopy/15 bg-surface",
            )}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div className="flex min-w-0 items-center gap-x-4">
                <p className="hidden shrink-0 font-display text-xl text-ink sm:block">
                  Watch · Save · Return
                </p>
                <div className="hidden h-4 w-px bg-line sm:block" aria-hidden />
                <ul className="-mx-1 flex min-w-0 flex-nowrap items-center gap-x-3 overflow-x-auto overscroll-x-contain px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
                  {CAPABILITIES.map(({ icon: Icon, label }) => (
                    <li
                      key={label}
                      className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-ink/60"
                    >
                      <Icon className="h-3.5 w-3.5 text-canopy" aria-hidden />
                      {label}
                    </li>
                  ))}
                </ul>
              </div>

              <AuthOpenButton
                mode="sign-up"
                className="inline-flex w-fit shrink-0 self-start rounded-lg bg-canopy px-4 py-2 text-sm font-semibold text-white transition hover:bg-canopy-deep"
              >
                Create free account
              </AuthOpenButton>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
