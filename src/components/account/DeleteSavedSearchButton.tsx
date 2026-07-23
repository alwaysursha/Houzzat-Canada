"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function DeleteSavedSearchButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function remove() {
    setPending(true);
    await fetch("/api/saved-searches", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setPending(false);
    window.dispatchEvent(new Event("houzzat:saved-searches-changed"));
    window.dispatchEvent(new Event("houzzat:homepage-personalization-changed"));
    router.refresh();
  }

  return (
    <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={remove}>
      Remove
    </Button>
  );
}
