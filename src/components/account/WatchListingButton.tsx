"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function WatchListingButton({
  mlsNumber,
  initiallyWatching,
  signedIn,
  idleLabel = "Watch",
  activeLabel = "Watching",
}: {
  mlsNumber: string;
  initiallyWatching: boolean;
  signedIn: boolean;
  idleLabel?: string;
  activeLabel?: string;
}) {
  const router = useRouter();
  const { openAuth } = useAuthModal();
  const [watching, setWatching] = useState(initiallyWatching);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (!signedIn) {
      openAuth({
        mode: "sign-in",
        callbackUrl: `/listing/${mlsNumber}`,
      });
      return;
    }

    setPending(true);
    const res = await fetch("/api/account/property-monitors", {
      method: watching ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mlsNumber }),
    });
    setPending(false);
    if (!res.ok) return;
    setWatching(!watching);
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() => void toggle()}
      className={cn(watching && "border-signal text-signal")}
      title="Notify me of price and status changes"
    >
      {watching ? (
        <Bell className="h-4 w-4 fill-signal text-signal" />
      ) : (
        <BellOff className="h-4 w-4" />
      )}
      {watching ? activeLabel : idleLabel}
    </Button>
  );
}
