"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RouteStartIcon } from "@/components/icons/RouteStartIcon";
import { useRoutePlanner } from "@/components/route-planner/RoutePlannerProvider";
import { cn } from "@/lib/utils";

export function RoutePlannerFloatingChip() {
  const pathname = usePathname();
  const routePlanner = useRoutePlanner();
  const count = routePlanner?.count ?? 0;
  const visible = Boolean(routePlanner?.ready && count > 0);
  const aboveListingBar = pathname.startsWith("/listing/");

  return (
    <Link
      href="/route-planner"
      data-houzzat-route-planner-target=""
      aria-label={`Route Planner, ${count} homes`}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={cn(
        // z-[60] stays above listing rails/cards (often transform on hover) but
        // below modals/toasts (90+). Solid bg so cards never show through.
        // Keep in layout even when hidden so fly-to can measure the target.
        "fixed left-4 z-[60] inline-flex items-center gap-2 rounded-md border border-canopy/30 bg-surface px-3 py-2 text-sm font-semibold text-canopy shadow-lg transition-[opacity,transform,background-color,border-color] duration-200 hover:border-canopy/55 hover:bg-mist sm:left-6",
        aboveListingBar
          ? "bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-6"
          : "bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:bottom-6",
        visible
          ? "pointer-events-auto translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <RouteStartIcon />
      <span className="relative z-[1]">Route Planner · {count}</span>
    </Link>
  );
}
