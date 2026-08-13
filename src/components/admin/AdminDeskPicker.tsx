"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DESK_AGENT_ALL } from "@/lib/agent/desk-constants";
import { staffHardNavigate } from "@/components/site/StaffHardLink";
import { cn } from "@/lib/utils";

type AgentOption = {
  id: string;
  name: string | null;
  email: string;
};

export function AdminDeskPicker({
  agents,
  selectedAgentId,
  compact = false,
}: {
  agents: AgentOption[];
  /** null = team overview */
  selectedAgentId: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [value, setValue] = useState(selectedAgentId ?? DESK_AGENT_ALL);

  async function saveDesk(next: string) {
    const res = await fetch("/api/agent/desk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deskAgentId: next === DESK_AGENT_ALL ? null : next,
      }),
    });
    if (!res.ok) throw new Error("Failed to set desk");
  }

  async function onSelect(next: string) {
    if (pending) return;
    setValue(next);
    setPending(true);
    try {
      await saveDesk(next);
      // Same Admin section — soft refresh is fine.
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function openCrm() {
    if (pending) return;
    setPending(true);
    try {
      await saveDesk(value);
      // Cross into (agent) with a full document load (Capacitor-safe).
      staffHardNavigate("/agent");
    } catch {
      setPending(false);
    }
  }

  if (agents.length === 0) return null;

  return (
    <div className={cn("min-w-0", compact ? "px-0" : "px-1")}>
      {!compact ? (
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/40">
          View agent desk
        </p>
      ) : null}
      <select
        value={value}
        disabled={pending}
        onChange={(e) => void onSelect(e.target.value)}
        aria-label="Select agent desk to view"
        className={cn(
          "w-full truncate rounded-lg border border-line bg-white text-ink outline-none transition focus:border-canopy/50",
          compact
            ? "px-1.5 py-1 text-[10px]"
            : "px-2.5 py-2 text-[12px] font-medium",
        )}
      >
        <option value={DESK_AGENT_ALL}>Team overview</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name || agent.email}
          </option>
        ))}
      </select>
      {!compact ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => void openCrm()}
          className="mt-2 w-full rounded-lg bg-canopy px-2.5 py-2 text-[12px] font-semibold text-white transition hover:bg-canopy/90 disabled:opacity-60"
        >
          Open CRM desk
        </button>
      ) : null}
    </div>
  );
}
