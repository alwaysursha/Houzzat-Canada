"use client";

import type { LeadProfileV2AppointmentsPanel } from "@/lib/agent/lead-profile-v2/types";

export function LeadProfileV2AppointmentsPanel({
  panel,
  loading,
  error,
}: {
  panel: LeadProfileV2AppointmentsPanel | null;
  loading: boolean;
  error: boolean;
}) {
  return (
    <div className="space-y-3">
      {loading ? (
        <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
          Loading…
        </p>
      ) : error ? (
        <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
          Failed to load
        </p>
      ) : (panel?.appointments.length ?? 0) === 0 ? (
        <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
          No appointments.
        </p>
      ) : (
        (panel?.appointments ?? []).map((a) => (
          <div
            key={a.id}
            className="rounded-lg border border-[#e2e8f0] bg-white px-4 py-3"
          >
            <p className="text-[14px] font-semibold text-[#1e2a38]">
              {a.type.replaceAll("_", " ")} · {a.status}
            </p>
            <p className="mt-1 text-[12px] text-[#64748b]">
              {a.startsAt
                ? new Date(a.startsAt).toLocaleString("en-CA")
                : "Unscheduled"}
              {a.listingMls ? ` · ${a.listingMls}` : ""}
            </p>
            {a.videoJoinUrl ? (
              <a
                href={a.videoJoinUrl}
                className="mt-1 inline-block text-[12px] font-semibold text-[#2b6cb0] hover:underline"
              >
                Join link
              </a>
            ) : null}
            {a.notes ? (
              <p className="mt-2 text-[12px] text-[#475569]">{a.notes}</p>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}
