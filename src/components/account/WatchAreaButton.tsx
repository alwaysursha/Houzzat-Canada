"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { Button } from "@/components/ui/button";

export function WatchAreaButton({
  city,
  community,
  transactionType,
  segment,
  signedIn,
  idleLabel = "Watch this area",
  authCallbackUrl = "/search",
}: {
  city: string;
  community?: string;
  transactionType: "SALE" | "LEASE" | "ALL";
  segment?: "RESIDENTIAL" | "COMMERCIAL" | "ALL";
  signedIn: boolean;
  idleLabel?: string;
  authCallbackUrl?: string;
}) {
  const { openAuth } = useAuthModal();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const canWatch = Boolean(city.trim());

  async function watch() {
    if (!signedIn) {
      openAuth({ mode: "sign-in", callbackUrl: authCallbackUrl });
      return;
    }
    if (!canWatch) return;

    setPending(true);
    const res = await fetch("/api/account/area-monitors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        city: city.trim(),
        community: community?.trim() || null,
        transactionType:
          transactionType === "ALL" ? "ALL" : transactionType,
        segment:
          segment && segment !== "ALL" ? segment : "RESIDENTIAL",
        notifyNew: true,
        notifySold: true,
      }),
    });
    setPending(false);
    if (res.ok) setDone(true);
  }

  if (done) {
    return (
      <p className="text-sm font-medium text-canopy">
        Area watched — manage in Monitors.
      </p>
    );
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={pending || !canWatch}
      onClick={() => void watch()}
      title={
        canWatch
          ? "Get alerts for new and sold listings in this area"
          : "Set a city first"
      }
    >
      <MapPin className="h-4 w-4" />
      {pending ? "Watching…" : idleLabel}
    </Button>
  );
}
