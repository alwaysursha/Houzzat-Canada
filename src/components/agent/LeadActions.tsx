"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { LeadStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";

const STATUSES: LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "ACTIVE_BUYER",
  "SHOWING",
  "OFFER",
  "CLIENT",
  "NURTURE",
  "LOST",
];

export function LeadActions({
  leadId,
  status,
  canClaim,
}: {
  leadId: string;
  status: LeadStatus;
  canClaim: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setPending(true);
    await fetch("/api/agent/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, ...body }),
    });
    setPending(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canClaim ? (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => patch({ claim: true, status: "CONTACTED" })}
        >
          Claim
        </Button>
      ) : null}
      <select
        className="h-9 rounded-lg border border-line bg-surface px-2 text-sm"
        value={status}
        disabled={pending}
        onChange={(e) => patch({ status: e.target.value })}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    </div>
  );
}
