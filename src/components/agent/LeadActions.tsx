"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { LeadStatus } from "@prisma/client";
import { PipelineStatusMenu } from "@/components/agent/PipelineStatusMenu";

export function LeadActions({
  leadId,
  status,
  canClaim,
  statusChangedAt,
  createdAt,
  showStatus = false,
  onUpdated,
}: {
  leadId: string;
  status: LeadStatus;
  canClaim: boolean;
  statusChangedAt?: string | Date | null;
  createdAt?: string | Date;
  /** When true, render compact pipeline menu (kanban / non-profile). */
  showStatus?: boolean;
  onUpdated?: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function claim() {
    setPending(true);
    try {
      const res = await fetch("/api/agent/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, claim: true }),
      });
      if (res.ok) {
        router.refresh();
        onUpdated?.();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canClaim ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => claim()}
          className="rounded-lg bg-canopy px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-canopy-deep disabled:opacity-50"
        >
          Claim
        </button>
      ) : null}
      {showStatus && createdAt ? (
        <PipelineStatusMenu
          leadId={leadId}
          status={status}
          statusChangedAt={statusChangedAt}
          createdAt={createdAt}
          variant="compact"
          onUpdated={onUpdated}
          className="min-w-[160px]"
        />
      ) : null}
    </div>
  );
}
