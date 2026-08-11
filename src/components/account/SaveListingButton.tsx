"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Heart } from "lucide-react";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { useListingAccountChrome } from "@/components/listings/ListingAccountChromeProvider";
import { Button } from "@/components/ui/button";
import { SITE_MESSAGES } from "@/lib/site-messages";
import { cn } from "@/lib/utils";

export function SaveListingButton({
  mlsNumber,
  initiallySaved,
  signedIn,
  authCallbackUrl,
}: {
  mlsNumber: string;
  initiallySaved: boolean;
  signedIn: boolean;
  authCallbackUrl?: string;
}) {
  const router = useRouter();
  const { openAuth } = useAuthModal();
  const { toast } = useSiteAlert();
  const chrome = useListingAccountChrome();
  const [saved, setSaved] = useState(initiallySaved);
  const [pending, setPending] = useState(false);
  const userTouched = useRef(false);

  useEffect(() => {
    if (userTouched.current) return;
    if (chrome.active && chrome.loaded) {
      setSaved(chrome.saved);
      return;
    }
    setSaved(initiallySaved);
  }, [chrome.active, chrome.loaded, chrome.saved, initiallySaved]);

  async function toggle() {
    if (!signedIn) {
      openAuth({
        mode: "sign-in",
        callbackUrl: authCallbackUrl ?? `/listing/${mlsNumber}`,
      });
      return;
    }

    setPending(true);
    const res = await fetch("/api/saved-listings", {
      method: saved ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mlsNumber }),
    });
    setPending(false);

    if (!res.ok) {
      toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
      return;
    }
    const next = !saved;
    userTouched.current = true;
    setSaved(next);
    toast({
      message: next
        ? SITE_MESSAGES.saveAddedToast
        : SITE_MESSAGES.saveRemovedToast,
      tone: next ? "success" : "info",
    });
    window.dispatchEvent(new Event("houzzat:saved-listings-changed"));
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() => void toggle()}
      className={cn(saved && "border-canopy text-canopy")}
    >
      <Heart className={cn("h-4 w-4", saved && "fill-canopy text-canopy")} />
      {saved ? "Saved" : "Save listing"}
    </Button>
  );
}
