"use client";

import { useState } from "react";
import { staffHardNavigate } from "@/components/site/StaffHardLink";
import type { LaunchpadIdentityMode } from "@/lib/agent/resolve-desk-view";

export function LaunchpadDeskIdentity({
  text,
  mode,
  ownUserId,
}: {
  text: string;
  mode: LaunchpadIdentityMode;
  ownUserId: string;
}) {
  const [pending, setPending] = useState(false);
  const showSwitchBack = mode === "other";

  async function switchBackToAdmin() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/agent/desk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deskAgentId: ownUserId }),
      });
      if (!res.ok) {
        setPending(false);
        return;
      }
      staffHardNavigate("/agent");
    } catch {
      setPending(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
      <p className="min-w-0 text-[12px] font-medium text-ink/55">{text}</p>
      {showSwitchBack ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => void switchBackToAdmin()}
          className="shrink-0 text-[12px] font-semibold text-[#2b6cb0] underline-offset-2 hover:underline disabled:opacity-60"
        >
          Switch Back to Admin
        </button>
      ) : null}
    </div>
  );
}
