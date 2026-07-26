"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { Button } from "@/components/ui/button";
import { SITE_MESSAGES } from "@/lib/site-messages";

export function DeleteSavedSearchButton({ id }: { id: string }) {
  const router = useRouter();
  const { confirm, toast } = useSiteAlert();
  const [pending, setPending] = useState(false);

  async function remove() {
    const ok = await confirm({
      ...SITE_MESSAGES.deleteSavedSearch,
      destructive: true,
    });
    if (!ok) return;

    setPending(true);
    const res = await fetch("/api/saved-searches", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setPending(false);
    if (!res.ok) {
      toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
      return;
    }
    toast({ message: "Saved search deleted.", tone: "success" });
    window.dispatchEvent(new Event("houzzat:saved-searches-changed"));
    window.dispatchEvent(new Event("houzzat:homepage-personalization-changed"));
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => void remove()}
    >
      Remove
    </Button>
  );
}
