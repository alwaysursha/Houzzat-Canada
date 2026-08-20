"use client";

import { Heart } from "lucide-react";
import { useSavedListingToggle } from "@/components/account/useSavedListingToggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SaveListingButton({
  mlsNumber,
  initiallySaved,
  signedIn: _signedIn,
  authCallbackUrl,
}: {
  mlsNumber: string;
  initiallySaved: boolean;
  /** Kept for call-site compatibility; session is read inside the toggle hook. */
  signedIn: boolean;
  authCallbackUrl?: string;
}) {
  const { saved, pending, ready, toggle } = useSavedListingToggle({
    mlsNumber,
    initiallySaved,
    authCallbackUrl,
  });

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={pending || !ready}
      onClick={() => void toggle()}
      className={cn(saved && "border-canopy text-canopy")}
      aria-busy={pending || !ready}
    >
      <Heart className={cn("h-4 w-4", saved && "fill-canopy text-canopy")} />
      {saved ? "Saved" : "Save listing"}
    </Button>
  );
}
