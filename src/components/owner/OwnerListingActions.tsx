"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { Button } from "@/components/ui/button";
import { SITE_MESSAGES } from "@/lib/site-messages";

export function OwnerListingActions({
  listingId,
  ownerStatus,
}: {
  listingId: string;
  ownerStatus: string | null;
}) {
  const router = useRouter();
  const { confirm, toast } = useSiteAlert();
  const [busy, setBusy] = useState(false);

  async function act(action: "pause" | "resume") {
    if (action === "pause") {
      const ok = await confirm({
        title: "Pause this listing?",
        message:
          "Buyers won’t see this owner listing while it’s paused. You can resume it anytime.",
        confirmLabel: "Pause listing",
        cancelLabel: "Keep active",
        destructive: true,
      });
      if (!ok) return;
    }

    setBusy(true);
    const res = await fetch(`/api/owner/listings/${listingId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      toast({
        message: data.error ?? SITE_MESSAGES.genericErrorToast,
        tone: "error",
      });
      return;
    }
    toast({
      message:
        action === "pause"
          ? "Listing paused."
          : "Listing resumed and visible again.",
      tone: "success",
    });
    router.refresh();
  }

  if (ownerStatus !== "ACTIVE" && ownerStatus !== "PAUSED") return null;

  return (
    <div className="space-y-2">
      {ownerStatus === "ACTIVE" ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => void act("pause")}
        >
          Pause listing
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => void act("resume")}
        >
          Resume listing
        </Button>
      )}
    </div>
  );
}
