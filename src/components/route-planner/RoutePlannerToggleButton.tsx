"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import { useRef } from "react";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { RouteStartIcon } from "@/components/icons/RouteStartIcon";
import { useRoutePlanner } from "@/components/route-planner/RoutePlannerProvider";
import { flyRouteToPlanner } from "@/lib/fly-to-route-planner";
import { SITE_MESSAGES } from "@/lib/site-messages";
import { cn } from "@/lib/utils";

export function RoutePlannerToggleButton({
  mlsNumber,
  listingStatus,
  className,
  size = "icon",
}: {
  mlsNumber: string;
  /** Only ACTIVE listings can join your Route Planner. */
  listingStatus?: string;
  className?: string;
  size?: "icon" | "button";
}) {
  const routePlanner = useRoutePlanner();
  const { toast } = useSiteAlert();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const onTour = routePlanner?.isOnTour(mlsNumber) ?? false;
  const inactive = listingStatus != null && listingStatus !== "ACTIVE";

  async function onClick(event: ReactMouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (inactive) {
      toast({
        message: "Only active listings can be added to your Route Planner.",
        tone: "info",
      });
      return;
    }
    if (!routePlanner) return;
    const result = await routePlanner.toggleStop(mlsNumber);
    if (!result.ok) {
      toast({
        message: result.error ?? SITE_MESSAGES.genericErrorToast,
        tone: "error",
      });
      return;
    }
    if (result.added && buttonRef.current) {
      const el = buttonRef.current;
      // Wait for the floating chip to paint (count 0 → 1) before measuring.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => flyRouteToPlanner(el));
      });
      return;
    }
    toast({
      message: SITE_MESSAGES.routePlannerRemovedToast,
      tone: "info",
    });
  }

  if (size === "button") {
    return (
      <button
        ref={buttonRef}
        type="button"
        data-houzzat-listing-coach="route"
        onClick={(e) => void onClick(e)}
        disabled={inactive}
        className={cn(
          "inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition",
          onTour
            ? "border-canopy/40 bg-canopy/10 text-canopy"
            : "border-line bg-surface text-ink hover:border-canopy/40 hover:bg-canopy/5",
          inactive && "cursor-not-allowed opacity-50",
          className,
        )}
      >
        <RouteStartIcon />
        {onTour ? "On your route ✓" : "Add to Route Planner"}
      </button>
    );
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      data-houzzat-listing-coach="route"
      aria-label={onTour ? "Remove from Route Planner" : "Add to Route Planner"}
      disabled={inactive}
      onClick={(e) => void onClick(e)}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-lg border border-line bg-mist text-ink transition hover:border-canopy/40 hover:bg-canopy/5",
        onTour && "border-canopy/40 bg-canopy/10 text-canopy",
        inactive && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <RouteStartIcon />
    </button>
  );
}
