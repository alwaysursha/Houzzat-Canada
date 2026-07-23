"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function OwnerListingActions({
  listingId,
  ownerStatus,
}: {
  listingId: string;
  ownerStatus: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "pause" | "resume") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/owner/listings/${listingId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Action failed.");
      return;
    }
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
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
