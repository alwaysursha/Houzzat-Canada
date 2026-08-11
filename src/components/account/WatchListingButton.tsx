"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { useListingAccountChrome } from "@/components/listings/ListingAccountChromeProvider";
import { Button } from "@/components/ui/button";
import { SITE_MESSAGES } from "@/lib/site-messages";
import { cn } from "@/lib/utils";

export function WatchListingButton({
  mlsNumber,
  initiallyWatching,
  signedIn,
  idleLabel = "Watch",
  activeLabel = "Watching",
  authCallbackUrl,
}: {
  mlsNumber: string;
  initiallyWatching: boolean;
  signedIn: boolean;
  idleLabel?: string;
  activeLabel?: string;
  authCallbackUrl?: string;
}) {
  const router = useRouter();
  const { openAuth } = useAuthModal();
  const { alert, confirm, toast } = useSiteAlert();
  const chrome = useListingAccountChrome();
  const [watching, setWatching] = useState(initiallyWatching);
  const [pending, setPending] = useState(false);
  const userTouched = useRef(false);

  useEffect(() => {
    if (userTouched.current) return;
    if (chrome.active && chrome.loaded) {
      setWatching(chrome.watching);
      return;
    }
    setWatching(initiallyWatching);
  }, [chrome.active, chrome.loaded, chrome.watching, initiallyWatching]);

  async function toggle() {
    if (!signedIn) {
      openAuth({
        mode: "sign-in",
        callbackUrl: authCallbackUrl ?? `/listing/${mlsNumber}`,
      });
      return;
    }

    if (watching) {
      const ok = await confirm({
        ...SITE_MESSAGES.stopWatchingHome,
        destructive: true,
      });
      if (!ok) return;
    }

    setPending(true);
    const res = await fetch("/api/account/property-monitors", {
      method: watching ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mlsNumber }),
    });
    setPending(false);
    if (!res.ok) {
      toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
      return;
    }
    const next = !watching;
    userTouched.current = true;
    setWatching(next);
    router.refresh();

    if (next) {
      await alert({ ...SITE_MESSAGES.watchAdded });
    } else {
      toast({ message: SITE_MESSAGES.watchRemovedToast, tone: "info" });
    }
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
