"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { Button } from "@/components/ui/button";
import { SITE_MESSAGES } from "@/lib/site-messages";

export function ApplyHomepageSearchButton({
  id,
  active,
}: {
  id: string;
  active: boolean;
}) {
  const router = useRouter();
  const { confirm, toast } = useSiteAlert();
  const [pending, setPending] = useState(false);

  async function apply() {
    if (active) {
      const ok = await confirm({
        ...SITE_MESSAGES.removeHomepageSearch,
        destructive: true,
      });
      if (!ok) return;
    }

    setPending(true);
    const res = await fetch("/api/saved-searches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isHomepageActive: !active }),
    });
    setPending(false);
    if (!res.ok) {
      toast({ message: SITE_MESSAGES.genericErrorToast, tone: "error" });
      return;
    }
    toast({
      message: active
        ? "Removed from homepage personalization."
        : "Applied to your homepage.",
      tone: "success",
    });
    window.dispatchEvent(new Event("houzzat:homepage-personalization-changed"));
    window.dispatchEvent(new Event("houzzat:saved-searches-changed"));
    router.refresh();
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "secondary" : "default"}
      disabled={pending}
      onClick={() => void apply()}
    >
      {pending
        ? "Updating…"
        : active
          ? "Remove from homepage"
          : "Apply to homepage"}
    </Button>
  );
}
