"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ApplyHomepageSearchButton({
  id,
  active,
}: {
  id: string;
  active: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function apply() {
    setPending(true);
    await fetch("/api/saved-searches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isHomepageActive: !active ? true : false }),
    });
    setPending(false);
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
