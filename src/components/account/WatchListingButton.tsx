"use client";

import { Bell, BellOff } from "lucide-react";
import { useWatchListingToggle } from "@/components/account/useWatchListingToggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function WatchListingButton({
  mlsNumber,
  initiallyWatching,
  signedIn: _signedIn,
  idleLabel = "Watch",
  activeLabel = "Watching",
  authCallbackUrl,
  appearance,
}: {
  mlsNumber: string;
  initiallyWatching: boolean;
  /** Kept for call-site compatibility; session is read inside the toggle hook. */
  signedIn: boolean;
  idleLabel?: string;
  activeLabel?: string;
  authCallbackUrl?: string;
  /** Royal Collection property toolbar. Houzzat omits this. */
  appearance?: "royal";
}) {
  const { watching, pending, ready, toggle } = useWatchListingToggle({
    mlsNumber,
    initiallyWatching,
    authCallbackUrl,
  });

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={pending || !ready}
      onClick={() => void toggle()}
      className={cn(watching && appearance !== "royal" && "border-signal text-signal")}
      data-rc-action={appearance === "royal" ? "" : undefined}
      data-active={appearance === "royal" && watching ? "true" : undefined}
      title="Notify me of price and status changes"
      aria-busy={pending || !ready}
    >
      {watching ? (
        <Bell
          className={cn(
            "h-4 w-4",
            appearance === "royal" ? "fill-[#C8A66A] text-[#C8A66A]" : "fill-signal text-signal",
          )}
        />
      ) : (
        <BellOff className="h-4 w-4" />
      )}
      {watching ? activeLabel : idleLabel}
    </Button>
  );
}
