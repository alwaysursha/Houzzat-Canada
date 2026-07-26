"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Route } from "lucide-react";
import { useViewingDay } from "@/components/viewing-day/ViewingDayProvider";
import { cn } from "@/lib/utils";

export function ViewingDayFloatingChip() {
  const pathname = usePathname();
  const viewingDay = useViewingDay();
  const count = viewingDay?.count ?? 0;
  const visible = Boolean(viewingDay?.ready && count > 0);
  const aboveListingBar = pathname.startsWith("/listing/");

  return (
    <Link
      href="/viewing-day"
      aria-label={`Viewing day, ${count} homes`}
      tabIndex={visible ? 0 : -1}
      className={cn(
        "fixed left-4 z-40 inline-flex items-center gap-2 rounded-md border border-canopy/25 bg-surface px-3 py-2 text-sm font-semibold text-canopy shadow-md transition-[opacity,transform] duration-200 hover:border-canopy/45 hover:bg-canopy/5 sm:left-6",
        aboveListingBar
          ? "bottom-[4.75rem] md:bottom-6"
          : "bottom-5 sm:bottom-6",
        visible
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <Route className="size-4" strokeWidth={2.25} aria-hidden />
      <span>Viewing day · {count}</span>
    </Link>
  );
}
