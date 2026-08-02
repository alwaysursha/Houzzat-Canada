"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Megaphone, UserRound } from "lucide-react";
import { LeadQuickPopup } from "@/components/agent/LeadQuickPopup";
import {
  INQUIRY_TAGS,
  INQUIRY_TAG_LABEL,
  INQUIRY_TAG_STYLE,
  type InquiryTagValue,
  resolveInquiryTag,
} from "@/lib/agent/inquiry-tag";
import { cn } from "@/lib/utils";

export type ContactRequestedLead = {
  id: string;
  source: string;
  status: string;
  notes: string | null;
  listingMls: string | null;
  inquiryTag: InquiryTagValue | null;
  createdAt: string;
  customer: {
    name: string | null;
    email: string;
    isBuyer: boolean;
    isSeller: boolean;
  } | null;
  isOnline?: boolean;
  binge?: boolean;
};

function TypeFilter({
  selected,
  onChange,
}: {
  selected: InquiryTagValue[];
  onChange: (next: InquiryTagValue[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const label = useMemo(() => {
    if (selected.length === 0) return "Type: All";
    const first = INQUIRY_TAG_LABEL[selected[0]!];
    if (selected.length === 1) return `Type: ${first}`;
    return `Type: ${first} +${selected.length - 1}`;
  }, [selected]);

  function toggle(tag: InquiryTagValue) {
    onChange(
      selected.includes(tag)
        ? selected.filter((t) => t !== tag)
        : [...selected, tag],
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded border bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#1e2a38]",
          open
            ? "border-[#2b6cb0] ring-1 ring-[#2b6cb0]/30"
            : "border-[#d8dee6]",
        )}
      >
        {label}
        <ChevronDown className="size-3.5 text-[#94a3b8]" />
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 cursor-default"
            aria-label="Close type filter"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-md border border-[#d8dee6] bg-white py-1 shadow-lg">
            {INQUIRY_TAGS.map((tag) => (
              <label
                key={tag}
                className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px] text-[#1e2a38] hover:bg-[#f1f5f9]"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(tag)}
                  onChange={() => toggle(tag)}
                  className="size-3.5 rounded border-[#94a3b8] text-[#2b6cb0] focus:ring-[#2b6cb0]"
                />
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-bold",
                    INQUIRY_TAG_STYLE[tag].soft,
                  )}
                >
                  {INQUIRY_TAG_LABEL[tag]}
                </span>
              </label>
            ))}
            <button
              type="button"
              onClick={() => {
                onChange([]);
                setOpen(false);
              }}
              className="w-full border-t border-[#e8edf2] px-3 py-2 text-left text-[13px] font-semibold text-[#2b6cb0] hover:bg-[#f1f5f9]"
            >
              Clear
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function ContactRequestedPanel({
  leads,
}: {
  leads: ContactRequestedLead[];
}) {
  const router = useRouter();
  const [typeFilter, setTypeFilter] = useState<InquiryTagValue[]>([]);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "NEW_LEAD">(
    "NEW_LEAD",
  );
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageVisible, setMessageVisible] = useState(false);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  function showToast(text: string) {
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    if (clearTimer.current) clearTimeout(clearTimer.current);
    setMessage(text);
    setMessageVisible(true);
    fadeTimer.current = setTimeout(() => setMessageVisible(false), 2200);
    clearTimer.current = setTimeout(() => setMessage(null), 2800);
  }

  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      if (dismissed.includes(lead.id)) return false;
      if (lead.inquiryTag) return false;
      if (statusFilter === "NEW_LEAD" && lead.status !== "NEW_LEAD")
        return false;
      const tag = resolveInquiryTag({
        inquiryTag: lead.inquiryTag,
        source: lead.source as never,
      });
      if (typeFilter.length === 0) return true;
      return typeFilter.includes(tag);
    });
  }, [leads, typeFilter, statusFilter, dismissed]);

  async function tagLead(leadId: string, inquiryTag: InquiryTagValue) {
    setPendingId(leadId);
    setMessage(null);
    try {
      const res = await fetch("/api/agent/inquiry-tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, inquiryTag }),
      });
      const raw = await res.text();
      let json: {
        ok?: boolean;
        label?: string;
        reminderDueAt?: string;
        error?: string;
      } = {};
      try {
        json = raw ? (JSON.parse(raw) as typeof json) : {};
      } catch {
        showToast(
          "Tag failed — server returned an empty response. Reload and try again.",
        );
        return;
      }
      if (!res.ok) {
        showToast(json.error || "Could not tag inquiry");
        return;
      }
      setDismissed((prev) => [...prev, leadId]);
      const due = json.reminderDueAt
        ? new Date(json.reminderDueAt).toLocaleString("en-CA", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        : "";
      showToast(`${json.label} tagged · moved to To Do · due ${due}`);
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section
      ref={rootRef}
      className="rounded-md border border-[#d8dee6] bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)]"
    >
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[#e8edf2] px-4 py-3">
        <div className="flex items-center gap-2">
          <Megaphone className="size-4 text-[#5b6775]" />
          <h2 className="text-[15px] font-semibold text-[#1e2a38]">
            Contact Requested
          </h2>
        </div>
        <div className="relative z-30 flex flex-wrap items-center gap-2">
          <TypeFilter selected={typeFilter} onChange={setTypeFilter} />
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "ALL" | "NEW_LEAD")
            }
            className="rounded border border-[#d8dee6] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#1e2a38]"
          >
            <option value="NEW_LEAD">Status: New Lead</option>
            <option value="ALL">Status: All</option>
          </select>
        </div>
      </div>

      {message ? (
        <p
          className={cn(
            "border-b border-[#e8edf2] bg-[#f0fdf4] px-4 py-2 text-[12px] font-medium text-canopy-deep transition-opacity duration-500",
            messageVisible ? "opacity-100" : "opacity-0",
          )}
        >
          {message}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-[#94a3b8]">
          No open contact requests. Tagged leads live in To Do.
        </p>
      ) : (
        <ul className="divide-y divide-[#eef2f6]">
          {filtered.map((lead) => {
            const name =
              lead.customer?.name ||
              lead.customer?.email ||
              lead.source.replaceAll("_", " ");
            const initials = name
              .split(/\s+/)
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase() ?? "")
              .join("");
            return (
              <li key={lead.id} className="flex gap-3 px-4 py-3.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#e8eef5] text-[11px] font-bold text-[#2b6cb0]">
                  {initials || <UserRound className="size-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setOpenLeadId(lead.id)}
                      className="text-left text-[13px] font-semibold text-[#2b6cb0] hover:underline"
                    >
                      {name}
                    </button>
                    <time className="text-[11px] text-[#94a3b8]">
                      {new Date(lead.createdAt).toLocaleString("en-CA", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  <p className="mt-0.5 text-[12px] font-medium text-[#1e2a38]">
                    {lead.source.replaceAll("_", " ")}
                    {lead.isOnline ? " · Online now" : ""}
                    {lead.binge ? " · Multi-property binge" : ""}
                  </p>
                  <div className="mt-2 rounded border border-[#e8edf2] bg-[#f8fafc] px-3 py-2 text-[12px] text-[#475569]">
                    {(lead.notes || "New lead — reach out soon.")
                      .split("\n")
                      .slice(0, 2)
                      .join(" · ")
                      .slice(0, 160)}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8]">
                      Tag
                    </span>
                    {INQUIRY_TAGS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        disabled={pendingId === lead.id}
                        onClick={() => tagLead(lead.id, tag)}
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition disabled:opacity-50",
                          INQUIRY_TAG_STYLE[tag].idle,
                        )}
                      >
                        {INQUIRY_TAG_LABEL[tag]}
                      </button>
                    ))}
                    {lead.customer?.isBuyer ? (
                      <span className="rounded bg-[#dbeafe] px-1.5 py-0.5 text-[10px] font-bold text-[#1d4ed8]">
                        BUYER
                      </span>
                    ) : null}
                    {lead.customer?.isSeller ? (
                      <span className="rounded bg-[#ffedd5] px-1.5 py-0.5 text-[10px] font-bold text-[#c2410c]">
                        SELLER
                      </span>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {openLeadId ? (
        <LeadQuickPopup
          leadId={openLeadId}
          onClose={() => setOpenLeadId(null)}
        />
      ) : null}
    </section>
  );
}
