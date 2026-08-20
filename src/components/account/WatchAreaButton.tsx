"use client";

import { MapPin } from "lucide-react";
import { useWatchAreaToggle } from "@/components/account/useWatchAreaToggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function WatchAreaButton({
  city,
  community,
  transactionType,
  segment,
  signedIn: _signedIn,
  idleLabel = "Watch this area",
  activeLabel = "Area watched",
  authCallbackUrl = "/search",
  className,
}: {
  city: string;
  community?: string;
  transactionType: "SALE" | "LEASE" | "ALL";
  segment?: "RESIDENTIAL" | "COMMERCIAL" | "ALL";
  /** Kept for call-site compatibility; session is read inside the toggle hook. */
  signedIn: boolean;
  idleLabel?: string;
  activeLabel?: string;
  authCallbackUrl?: string;
  className?: string;
}) {
  const { watching, pending, ready, canWatch, toggle } = useWatchAreaToggle({
    city,
    community,
    transactionType,
    segment,
    authCallbackUrl,
  });

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={pending || !canWatch || !ready}
      onClick={() => void toggle()}
      className={cn(watching && "border-signal text-signal", className)}
      title={
        canWatch
          ? watching
            ? "Remove this area from your watchlist"
            : "Get alerts for new and sold listings in this area"
          : "Set a city first"
      }
      aria-busy={pending || !ready}
    >
      <MapPin
        className={cn("h-4 w-4", watching && "fill-signal text-signal")}
      />
      {pending
        ? watching
          ? "Removing…"
          : "Watching…"
        : watching
          ? activeLabel
          : idleLabel}
    </Button>
  );
}
