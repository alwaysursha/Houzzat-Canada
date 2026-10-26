"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RouteStartIcon } from "@/components/icons/RouteStartIcon";
import { useRoutePlanner } from "@/components/route-planner/RoutePlannerProvider";
import { interceptListingSheetExitClick } from "@/lib/listings/navigate-listing";
import { cn } from "@/lib/utils";

/**
 * Floating Route Planner count chip.
 * - `page`: site chrome (z-60) — hidden under listing sheet (z-200).
 * - `sheet`: rendered inside ListingSheetHost so it paints above the iframe.
 */
export function RoutePlannerFloatingChip({
  layer = "page",
}: {
  layer?: "page" | "sheet";
}) {
  const pathname = usePathname();
  const routePlanner = useRoutePlanner();
  const count = routePlanner?.count ?? 0;
  const visible = Boolean(routePlanner?.ready && count > 0);
  const aboveListingBar =
    layer === "page" && pathname.startsWith("/listing/");

  return (
    <Link
      href="/route-planner"
      onClick={(event) =>
        interceptListingSheetExitClick(event, "/route-planner")
      }
      data-houzzat-route-planner-target={layer === "sheet" ? "sheet" : ""}
      aria-label={`Route Planner, ${count} homes`}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={cn(
        // Page chip stays below modals; sheet chip must sit above the listing
        // iframe inside the z-[200] sheet stacking context.
        "fixed left-4 inline-flex items-center gap-2 rounded-md border border-canopy/30 bg-surface px-3 py-2 text-sm font-semibold text-canopy shadow-lg transition-[opacity,transform,background-color,border-color] duration-200 hover:border-canopy/55 hover:bg-mist sm:left-6",
        layer === "sheet" ? "z-[210]" : "z-[60]",
        layer === "sheet"
          ? "bottom-[calc(4.5rem+max(3rem,env(safe-area-inset-bottom,0px)))] md:bottom-6"
          : aboveListingBar
            ? "bottom-[calc(var(--mobile-bottom-nav,0px)+var(--rc-concierge-bar,0px)+5.5rem)] md:bottom-6"
            : "bottom-[calc(var(--mobile-bottom-nav,0px)+1.25rem)] sm:bottom-6",
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
