"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Clock3,
  Heart,
  MapPinned,
  Search,
} from "lucide-react";
import { AuthOpenButton } from "@/components/auth/AuthOpenButton";
import { cn } from "@/lib/utils";

const CAPABILITIES = [
  { icon: Heart, label: "Saved homes" },
  { icon: Search, label: "Saved searches" },
  { icon: Bell, label: "Alerts" },
  { icon: MapPinned, label: "Area monitors" },
  { icon: Clock3, label: "Recently viewed" },
] as const;

export function HomeCustomerToolsTease() {
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

  return (
    <>
      <div ref={sentinelRef} className="h-0 w-full" aria-hidden />
      <div
        className={cn(
          "sticky top-16 z-20 transition-[box-shadow,background-color,border-color] duration-300",
          stuck
            ? "border-b border-canopy/20 bg-mist/95 shadow-[0_8px_24px_-12px_rgba(15,107,76,0.35)] backdrop-blur-md"
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
              <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
                <p className="shrink-0 font-display text-xl text-ink">
                  Watch · Save · Return
                </p>
                <div className="hidden h-4 w-px bg-line sm:block" aria-hidden />
                <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  {CAPABILITIES.map(({ icon: Icon, label }) => (
                    <li
                      key={label}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink/60"
                    >
                      <Icon className="h-3.5 w-3.5 text-canopy" aria-hidden />
                      {label}
                    </li>
                  ))}
                </ul>
              </div>

              <AuthOpenButton
                mode="sign-up"
                className="inline-flex shrink-0 rounded-lg bg-canopy px-4 py-2 text-sm font-semibold text-white transition hover:bg-canopy-deep"
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
