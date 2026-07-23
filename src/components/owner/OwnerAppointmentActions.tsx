"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function OwnerAppointmentActions({
  appointmentId,
  status,
}: {
  appointmentId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setStatus(next: "CONFIRMED" | "CANCELLED" | "COMPLETED") {
    setBusy(true);
    await fetch("/api/owner/appointments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId, status: next }),
    });
    setBusy(false);
    router.refresh();
  }

  if (status === "CANCELLED" || status === "COMPLETED") return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {status === "REQUESTED" || status === "RESCHEDULED" ? (
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => void setStatus("CONFIRMED")}
        >
          Confirm
        </Button>
      ) : null}
      {status === "CONFIRMED" ? (
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => void setStatus("COMPLETED")}
        >
          Mark complete
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => void setStatus("CANCELLED")}
      >
        Cancel
      </Button>
    </div>
  );
}
