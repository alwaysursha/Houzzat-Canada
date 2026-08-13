"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Radio, X } from "lucide-react";
import { LeadQuickPopup } from "@/components/agent/LeadQuickPopup";
import { pipelineShortLabel } from "@/lib/agent/pipeline";
import type { LeadStatus } from "@prisma/client";
import {
  STAFF_OVERLAY_PRIORITY,
  useStaffOverlay,
} from "@/lib/mobile/use-staff-overlay";
import { cn } from "@/lib/utils";

export type OnlineLeadRow = {
  id: string;
  status: string;
  customer: { name: string | null; email: string } | null;
  lastSeenAt: string | null;
  isOnline: boolean;
};

function relativeAgo(iso: string | null) {
  if (!iso) return "Just now";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function OnlineLeadsModule({
  leads,
  deskView,
}: {
  leads: OnlineLeadRow[];
  deskView: string;
}) {
  const [open, setOpen] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const count = leads.length;
  const dashboardHref = `/agent/leads?view=${deskView}&online=1`;
  const leadIds = leads.map((l) => l.id);

  useStaffOverlay({
    open,
    id: "online-leads-sheet",
    priority: STAFF_OVERLAY_PRIORITY.sheet,
    onClose: () => setOpen(false),
  });

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !profileId) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open, profileId]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border border-[#d8dee6] border-l-4 border-l-emerald-500 bg-white px-3.5 py-3.5 text-left text-emerald-600 shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition active:scale-[0.99] hover:bg-[#f8fafc] sm:rounded-md sm:px-3 sm:py-3",
        )}
      >
        <Radio className="size-5 shrink-0 sm:size-5" strokeWidth={1.9} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-[#1e2a38] sm:text-[13px]">
            Online Leads
          </p>
          <p className="text-[13px] font-medium text-[#5b6775] sm:text-[12px] sm:font-normal">
            {count === 0
              ? "No leads active on the site right now"
              : `${count} lead${count === 1 ? "" : "s"} active on the site`}
          </p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-[#94a3b8]" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-[#1e2a38]/50 backdrop-blur-[1px]"
            aria-label="Close online leads"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="online-leads-title"
            className="relative z-10 flex max-h-[min(85vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[#e2e8f0] bg-white shadow-xl sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[#eef2f6] px-4 py-3.5 sm:px-5">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-600">
                  Live on site
                </p>
                <h2
                  id="online-leads-title"
                  className="mt-0.5 text-[17px] font-bold text-[#1e2a38]"
                >
                  Online Leads
                </h2>
                <p className="mt-0.5 text-[12px] text-[#64748b]">
                  Active in the last 3 minutes · {count} now
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-[#94a3b8] transition hover:bg-[#f1f5f9] hover:text-[#334155]"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-3">
              {leads.length === 0 ? (
                <p className="px-3 py-10 text-center text-sm text-[#94a3b8]">
                  Nobody from your desk is on the website right now.
                </p>
              ) : (
                <ul className="space-y-1">
                  {leads.map((lead) => {
                    const name =
                      lead.customer?.name ||
                      lead.customer?.email ||
                      "Lead";
                    return (
                      <li key={lead.id}>
                        <button
                          type="button"
                          onClick={() => setProfileId(lead.id)}
                          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-emerald-50/80"
                        >
                          <span className="relative flex size-2.5 shrink-0">
                            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                            <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-semibold text-[#1e2a38]">
                              {name}
                            </p>
                            <p className="truncate text-[12px] text-[#64748b]">
                              {lead.customer?.email
                                ? `${lead.customer.email} · `
                                : ""}
                              {pipelineShortLabel(lead.status as LeadStatus)}
                              {" · "}
                              {relativeAgo(lead.lastSeenAt)}
                            </p>
                          </div>
                          <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                            ONLINE
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="border-t border-[#eef2f6] px-4 py-3 sm:px-5">
              <Link
                href={dashboardHref}
                onClick={() => setOpen(false)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#2b6cb0] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#255a94]"
              >
                Open in leads dashboard
                <ChevronRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {profileId ? (
        <LeadQuickPopup
          leadId={profileId}
          leadIds={leadIds}
          onClose={() => setProfileId(null)}
          onNavigate={setProfileId}
        />
      ) : null}
    </>
  );
}
