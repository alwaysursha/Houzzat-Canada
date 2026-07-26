"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import { Route } from "lucide-react";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { useViewingDay } from "@/components/viewing-day/ViewingDayProvider";
import { SITE_MESSAGES } from "@/lib/site-messages";
import { cn } from "@/lib/utils";

export function ViewingDayToggleButton({
  mlsNumber,
  listingStatus,
  className,
  size = "icon",
}: {
  mlsNumber: string;
  /** Only ACTIVE listings can join a Viewing day. */
  listingStatus?: string;
  className?: string;
  size?: "icon" | "button";
}) {
  const viewingDay = useViewingDay();
  const { toast } = useSiteAlert();
  const onTour = viewingDay?.isOnTour(mlsNumber) ?? false;
  const inactive = listingStatus != null && listingStatus !== "ACTIVE";

  async function onClick(event: ReactMouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (inactive) {
      toast({
        message: "Only active listings can be added to a Viewing day.",
        tone: "info",
      });
      return;
    }
    if (!viewingDay) return;
    const result = await viewingDay.toggleStop(mlsNumber);
    if (!result.ok) {
      toast({
        message: result.error ?? SITE_MESSAGES.genericErrorToast,
        tone: "error",
      });
      return;
    }
    toast({
      message: result.added
        ? SITE_MESSAGES.viewingDayAddedToast
        : SITE_MESSAGES.viewingDayRemovedToast,
      tone: result.added ? "success" : "info",
    });
  }

  if (size === "button") {
    return (
      <button
        type="button"
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
        <Route className="size-4" strokeWidth={2.25} />
        {onTour ? "On Viewing day ✓" : "Add to Viewing day"}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={onTour ? "Remove from Viewing day" : "Add to Viewing day"}
      disabled={inactive}
      onClick={(e) => void onClick(e)}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-lg border border-line bg-mist text-ink transition hover:border-canopy/40 hover:bg-canopy/5",
        onTour && "border-canopy/40 bg-canopy/10 text-canopy",
        inactive && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <Route
        className={cn("size-4", onTour && "text-canopy")}
        strokeWidth={2.25}
      />
    </button>
  );
}
