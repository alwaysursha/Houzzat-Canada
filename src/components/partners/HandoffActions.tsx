"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function HandoffActions({
  token,
  status,
}: {
  token: string;
  status: string;
}) {
  const [current, setCurrent] = useState(status);
  const [pending, setPending] = useState(false);

  async function update(next: "ACCEPTED" | "DECLINED" | "CLOSED") {
    setPending(true);
    const res = await fetch(`/api/partners/handoffs/${token}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setPending(false);
    if (res.ok) setCurrent(next);
  }

  if (current === "CLOSED" || current === "DECLINED") {
    return <p className="text-xs text-ink/45">Marked {current.toLowerCase()}</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={() => void update("ACCEPTED")}
      >
        Accept
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => void update("DECLINED")}
      >
        Decline
      </Button>
      {current === "ACCEPTED" ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => void update("CLOSED")}
        >
          Close
        </Button>
      ) : null}
    </div>
  );
}
