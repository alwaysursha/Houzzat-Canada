"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AppointmentStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AppointmentActions({
  appointmentId,
  status,
  type,
  videoJoinUrl,
}: {
  appointmentId: string;
  status: AppointmentStatus;
  type: string;
  videoJoinUrl: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [startsAt, setStartsAt] = useState("");
  const [joinUrl, setJoinUrl] = useState(videoJoinUrl ?? "");

  async function patch(body: Record<string, unknown>) {
    setPending(true);
    await fetch("/api/agent/appointments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId, ...body }),
    });
    setPending(false);
    router.refresh();
  }

  return (
    <div className="space-y-2 rounded-xl border border-line bg-mist/50 p-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending || status === "CONFIRMED"}
          onClick={() =>
            patch({
              status: "CONFIRMED",
              startsAt: startsAt
                ? new Date(startsAt).toISOString()
                : undefined,
              videoJoinUrl: joinUrl || undefined,
            })
          }
        >
          Confirm
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => patch({ status: "COMPLETED" })}
        >
          Mark complete
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => patch({ status: "CANCELLED" })}
        >
          Cancel
        </Button>
      </div>
      <Input
        type="datetime-local"
        value={startsAt}
        onChange={(e) => setStartsAt(e.target.value)}
      />
      {type === "VIRTUAL_VIEWING" ? (
        <Input
          placeholder="Video join URL (Meet / Zoom / FaceTime link)"
          value={joinUrl}
          onChange={(e) => setJoinUrl(e.target.value)}
        />
      ) : null}
    </div>
  );
}
