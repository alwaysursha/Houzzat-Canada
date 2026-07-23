"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Heart } from "lucide-react";
import { useAuthModal } from "@/components/auth/AuthModalProvider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SaveListingButton({
  mlsNumber,
  initiallySaved,
  signedIn,
}: {
  mlsNumber: string;
  initiallySaved: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();
  const { openAuth } = useAuthModal();
  const [saved, setSaved] = useState(initiallySaved);
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
    const res = await fetch("/api/saved-listings", {
      method: saved ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mlsNumber }),
    });
    setPending(false);

    if (!res.ok) return;
    setSaved(!saved);
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={toggle}
      className={cn(saved && "border-canopy text-canopy")}
    >
      <Heart className={cn("h-4 w-4", saved && "fill-canopy text-canopy")} />
      {saved ? "Saved" : "Save home"}
    </Button>
  );
}
