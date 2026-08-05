"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Eye,
  Flame,
  Heart,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Star,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import type { LeadStatus } from "@prisma/client";
import { MassEmailForm } from "@/components/agent/LeadEmailForm";
import { LeadAccountVerifyMenu } from "@/components/agent/LeadAccountVerifyMenu";
import { openLeadProfileHref, rememberLeadNavIds } from "@/components/agent/LeadQueryPopup";
import {
  PIPELINE_STATUSES,
  PIPELINE_STATUS_ORDER,
  pipelineIcon,
  pipelineLabel,
  pipelinePillClass,
  pipelineShortLabel,
} from "@/lib/agent/pipeline";
import {
  purchaseTimeframeLabel,
  purchaseTimeframeSortKey,
} from "@/lib/agent/timeframe";
import { cn } from "@/lib/utils";

export type LeadRow = {
  id: string;
  source: string;
  status: string;
  score: number;
  listingMls: string | null;
  assignedAgentId: string | null;
  createdAt: string;
  firstRespondedAt: string | null;
  updatedAt: string;
  customer: {
    id: string | null;
    name: string | null;
    email: string;
    phone: string | null;
    isBuyer: boolean;
    isSeller: boolean;
    purchaseTimeframe: string | null;
    emailVerified: boolean;
    phoneVerified: boolean;
    createdAt: string;
  } | null;
  assignedAgent: { name: string | null; email: string } | null;
  nextReminder: string | null;
  openTaskCount: number;
  hotness: number;
  views24h: number;
  isOnline: boolean;
  binge: boolean;
  lastSeenAt: string | null;
  slaHoursOpen: number | null;
  saves: number;
  searches: number;
  inquiries: number;
  loginCount: number;
  priceCity: string | null;
  inquiryTag: string | null;
};

const STATUSES = PIPELINE_STATUSES;

const PAGE_SIZES = [25, 50, 100] as const;

type SortKey =
  | "name"
  | "pipeline"
  | "registered"
  | "priceCity"
  | "timeframe"
  | "lastLogin"
  | "lastTouch"
  | "nextReminder"
  | "activity"
  | "assigned";

type SortDir = "asc" | "desc";

function compareLeads(a: LeadRow, b: LeadRow, key: SortKey): number {
  switch (key) {
    case "name": {
      const an =
        a.customer?.name || a.customer?.email || a.source;
      const bn =
        b.customer?.name || b.customer?.email || b.source;
      return an.localeCompare(bn, undefined, { sensitivity: "base" });
    }
    case "pipeline":
      return (
        (PIPELINE_STATUS_ORDER[a.status as LeadStatus] ?? 99) -
        (PIPELINE_STATUS_ORDER[b.status as LeadStatus] ?? 99)
      );
    case "registered":
      return (
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    case "priceCity":
      return (a.priceCity || a.listingMls || "").localeCompare(
        b.priceCity || b.listingMls || "",
        undefined,
        { sensitivity: "base" },
      );
    case "timeframe":
      return (
        purchaseTimeframeSortKey(a.customer?.purchaseTimeframe) -
        purchaseTimeframeSortKey(b.customer?.purchaseTimeframe)
      );
    case "lastLogin":
      return (
        (a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0) -
        (b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0)
      );
    case "lastTouch": {
      const at = new Date(a.firstRespondedAt || a.updatedAt).getTime();
      const bt = new Date(b.firstRespondedAt || b.updatedAt).getTime();
      return at - bt;
    }
    case "nextReminder":
      return (
        (a.nextReminder ? new Date(a.nextReminder).getTime() : Number.MAX_SAFE_INTEGER) -
        (b.nextReminder ? new Date(b.nextReminder).getTime() : Number.MAX_SAFE_INTEGER)
      );
    case "activity": {
      const aa = a.views24h + a.searches + a.saves + a.inquiries;
      const ba = b.views24h + b.searches + b.saves + b.inquiries;
      return aa - ba;
    }
    case "assigned": {
      const an =
        a.assignedAgent?.name || a.assignedAgent?.email || "Unassigned";
      const bn =
        b.assignedAgent?.name || b.assignedAgent?.email || "Unassigned";
      return an.localeCompare(bn, undefined, { sensitivity: "base" });
    }
    default: {
      const _exhaustive: never = key;
      void _exhaustive;
      return 0;
    }
  }
}

function relativeShort(iso: string | null) {
  if (!iso) return "n/a";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "now";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days} day${days === 1 ? "" : "s"}`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"}`;
}

function sourceLabel(source: string) {
  return source.replaceAll("_", " ").toLowerCase();
}

export type AssignableAgent = {
  user: { id: string; name: string | null; email: string };
};

export function LeadsTableClient({
  leads,
  canClaimPond,
  canAssign,
  teamMembers = [],
  view,
}: {
  leads: LeadRow[];
  canClaimPond: boolean;
  canAssign?: boolean;
  teamMembers?: AssignableAgent[];
  view: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("lastLogin");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(25);
  const [page, setPage] = useState(0);
  const [massOpen, setMassOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [showMassEmail, setShowMassEmail] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pipelineOpenId, setPipelineOpenId] = useState<string | null>(null);
  const [phoneMenuId, setPhoneMenuId] = useState<string | null>(null);
  const [verifyState, setVerifyState] = useState<
    Record<string, { emailVerified: boolean; phoneVerified: boolean }>
  >({});
  const [pending, setPending] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = !needle
      ? [...leads]
      : leads.filter((l) => {
          const hay = [
            l.customer?.name,
            l.customer?.email,
            l.customer?.phone,
            l.source,
            l.status,
            l.listingMls,
            l.assignedAgent?.email,
            l.assignedAgent?.name,
            l.priceCity,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(needle);
        });

    list.sort((a, b) => {
      const cmp = compareLeads(a, b, sortKey);
      if (cmp !== 0) return sortDir === "asc" ? cmp : -cmp;
      // Stable secondary: hotness desc
      return b.hotness - a.hotness;
    });
    return list;
  }, [leads, q, sortKey, sortDir]);

  function openLead(leadId: string) {
    rememberLeadNavIds(filtered.map((l) => l.id));
    router.push(openLeadProfileHref(leadId, { view }), { scroll: false });
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);
  const end = Math.min(filtered.length, start + pageSize);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  }

  function SortHeader({
    label,
    column,
    className,
  }: {
    label: string;
    column: SortKey;
    className?: string;
  }) {
    const active = sortKey === column;
    return (
      <th className={cn("px-2 py-2.5", className)}>
        <button
          type="button"
          onClick={() => toggleSort(column)}
          className={cn(
            "inline-flex items-center gap-1 uppercase tracking-[0.06em] transition",
            active ? "text-[#475569]" : "text-[#64748b] hover:text-[#475569]",
          )}
        >
          {label}
          {active ? (
            sortDir === "asc" ? (
              <ArrowUp className="size-3 shrink-0" strokeWidth={2.25} />
            ) : (
              <ArrowDown className="size-3 shrink-0" strokeWidth={2.25} />
            )
          ) : (
            <ArrowUpDown className="size-3 shrink-0 opacity-45" strokeWidth={2} />
          )}
        </button>
      </th>
    );
  }

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleAll() {
    if (pageRows.every((r) => selected.includes(r.id))) {
      setSelected((prev) => prev.filter((id) => !pageRows.some((r) => r.id === id)));
    } else {
      setSelected((prev) => [
        ...new Set([...prev, ...pageRows.map((r) => r.id)]),
      ]);
    }
  }

  function resetAll() {
    setSelected([]);
    setQ("");
    setSortKey("name");
    setSortDir("asc");
    setPage(0);
    setPageSize(25);
    setShowMassEmail(false);
    setMassOpen(false);
  }

  async function patchLead(leadId: string, body: Record<string, unknown>) {
    setPending(true);
    try {
      const res = await fetch("/api/agent/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, ...body }),
      });
      if (res.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }

  function contactVerified(
    lead: LeadRow,
    channel: "email" | "phone",
  ): boolean {
    const local = verifyState[lead.id];
    if (channel === "email") {
      return local?.emailVerified ?? lead.customer?.emailVerified ?? false;
    }
    return local?.phoneVerified ?? lead.customer?.phoneVerified ?? false;
  }

  async function toggleVerify(
    lead: LeadRow,
    channel: "email" | "phone",
  ) {
    if (!lead.customer?.id) return;
    if (channel === "phone" && !lead.customer.phone) return;
    if (channel === "email" && !lead.customer.email) return;

    const next = !contactVerified(lead, channel);
    setVerifyState((prev) => ({
      ...prev,
      [lead.id]: {
        emailVerified:
          channel === "email"
            ? next
            : (prev[lead.id]?.emailVerified ??
              lead.customer?.emailVerified ??
              false),
        phoneVerified:
          channel === "phone"
            ? next
            : (prev[lead.id]?.phoneVerified ??
              lead.customer?.phoneVerified ??
              false),
      },
    }));

    const res = await fetch("/api/agent/leads/verify-contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: lead.id,
        channel,
        verified: next,
      }),
    });
    if (!res.ok) {
      setVerifyState((prev) => ({
        ...prev,
        [lead.id]: {
          emailVerified: lead.customer?.emailVerified ?? false,
          phoneVerified: lead.customer?.phoneVerified ?? false,
        },
      }));
      return;
    }
    router.refresh();
  }

  async function massStatus(status: LeadStatus) {
    if (!selected.length) return;
    setPending(true);
    setMassOpen(false);
    try {
      await Promise.all(
        selected.map((leadId) =>
          fetch("/api/agent/leads", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leadId, status }),
          }),
        ),
      );
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function massClaim() {
    if (!selected.length) return;
    setPending(true);
    setMassOpen(false);
    setAssignOpen(false);
    try {
      await Promise.all(
        selected.map((leadId) =>
          fetch("/api/agent/leads", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leadId, claim: true }),
          }),
        ),
      );
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function assignLeads(
    leadIds: string[],
    assigneeId: string | null,
  ) {
    if (!leadIds.length) return;
    setPending(true);
    setMassOpen(false);
    setAssignOpen(false);
    try {
      await Promise.all(
        leadIds.map((leadId) =>
          fetch("/api/agent/team", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "reassign",
              leadId,
              assigneeId,
            }),
          }),
        ),
      );
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function createLead(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    setPending(true);
    try {
      const res = await fetch("/api/agent/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addName.trim(),
          email: addEmail.trim(),
          phone: addPhone.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { error?: string; leadId?: string };
      if (!res.ok) {
        setAddError(json.error || "Could not create lead");
        return;
      }
      setAddOpen(false);
      setAddName("");
      setAddEmail("");
      setAddPhone("");
      router.refresh();
      if (json.leadId) openLead(json.leadId);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e2e8f0] bg-white px-1 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1 rounded border border-[#d8dee6] bg-white px-2 py-1.5">
            <input
              type="checkbox"
              checked={
                pageRows.length > 0 &&
                pageRows.every((r) => selected.includes(r.id))
              }
              onChange={toggleAll}
              className="size-3.5"
            />
            <ChevronDown className="size-3 text-[#94a3b8]" />
          </label>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMassOpen((v) => !v)}
              disabled={!selected.length || pending}
              className="inline-flex items-center gap-1 rounded border border-[#d7e3ef] bg-[#f3f7fb] px-2.5 py-1.5 text-[12px] font-semibold text-[#4a6f94] disabled:opacity-40"
            >
              Mass Actions
              <ChevronDown className="size-3" />
            </button>
            {massOpen ? (
              <div className="absolute left-0 top-full z-30 mt-1 w-48 rounded-md border border-[#d8dee6] bg-white py-1 shadow-lg">
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-[#f1f5f9]"
                  onClick={() => {
                    setShowMassEmail(true);
                    setMassOpen(false);
                  }}
                >
                  Mass email
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-[#f1f5f9]"
                  onClick={() => void massClaim()}
                >
                  Claim selected
                </button>
                {canAssign ? (
                  <>
                    <button
                      type="button"
                      className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-[#f1f5f9]"
                      onClick={() => setAssignOpen((v) => !v)}
                    >
                      Assign to agent…
                    </button>
                    {assignOpen ? (
                      <div className="border-t border-[#eef2f6] bg-[#f8fafc] py-1">
                        <button
                          type="button"
                          className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-[#eef2f6]"
                          onClick={() => void assignLeads(selected, null)}
                        >
                          Pond (unassigned)
                        </button>
                        {teamMembers.map((m) => (
                          <button
                            key={m.user.id}
                            type="button"
                            className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-[#eef2f6]"
                            onClick={() =>
                              void assignLeads(selected, m.user.id)
                            }
                          >
                            {m.user.name || m.user.email}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}
                <div className="my-1 border-t border-[#eef2f6]" />
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-[#f1f5f9]"
                    onClick={() => void massStatus(s)}
                  >
                    Set {pipelineLabel(s)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={resetAll}
            className="rounded border border-[#d8dee6] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#475569] hover:bg-[#f8fafc]"
          >
            Reset All
          </button>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="rounded border border-[#d8dee6] bg-white p-1.5 text-[#64748b] hover:bg-[#f8fafc]"
            title="Refresh"
          >
            <RefreshCw className="size-3.5" />
          </button>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="Search leads…"
            className="min-w-[160px] rounded border border-[#e2e8f0] bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-[#9db8d4]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded border border-[#e2e8f0] bg-white p-1.5 text-[#94a3b8] hover:bg-[#f8fafc]"
            title="Print"
          >
            <Printer className="size-3.5" />
          </button>

          <div className="inline-flex items-center gap-1 rounded border border-[#e2e8f0] bg-white px-2 py-1 text-[11px] font-semibold text-[#64748b]">
            VIEW:
            <select
              value={view}
              onChange={(e) => {
                router.push(`/agent/leads?view=${e.target.value}`);
              }}
              className="bg-transparent text-[11px] font-semibold text-[#475569] outline-none"
            >
              <option value="mine">My leads</option>
              <option value="pond">Pond</option>
              <option value="team">All team</option>
            </select>
          </div>

          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number]);
              setPage(0);
            }}
            className="rounded border border-[#d8dee6] bg-white px-2 py-1 text-[11px] font-semibold text-[#475569]"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>

          <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#64748b]">
            <button
              type="button"
              disabled={safePage <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded border border-[#d8dee6] p-1 disabled:opacity-30"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <span>
              {filtered.length === 0 ? "0 - 0 of 0" : `${start + 1} - ${end} of ${filtered.length}`}
            </span>
            <button
              type="button"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              className="rounded border border-[#d8dee6] p-1 disabled:opacity-30"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded bg-[#5b9aaa] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#4f8a99]"
          >
            <UserPlus className="size-3.5" />
            + Add New Lead
          </button>
        </div>
      </div>

      {showMassEmail && selected.length > 0 ? (
        <MassEmailForm leadIds={selected} />
      ) : null}

      {/* Mobile lead cards */}
      <div className="space-y-2.5 lg:hidden">
        {pageRows.length === 0 ? (
          <p className="rounded-xl border border-[#d8dee6] bg-white px-4 py-12 text-center text-sm text-[#94a3b8]">
            No leads in this view.
          </p>
        ) : (
          pageRows.map((lead) => {
            const name =
              lead.customer?.name ||
              lead.customer?.email ||
              lead.source.replaceAll("_", " ");
            const phone = lead.customer?.phone;
            const email = lead.customer?.email;
            const StatusIcon = pipelineIcon(lead.status as LeadStatus);
            return (
              <article
                key={lead.id}
                className="rounded-xl border border-[#d8dee6] bg-white p-3.5 shadow-[0_1px_2px_rgb(15_23_42/0.04)]"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selected.includes(lead.id)}
                    onChange={() => toggle(lead.id)}
                    className="mt-1 size-4 shrink-0"
                    aria-label={`Select ${name}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => openLead(lead.id)}
                        className="min-w-0 text-left text-[16px] font-bold leading-snug text-[#1e2a38] active:text-[#2b6cb0]"
                      >
                        {name}
                      </button>
                      {lead.isOnline ? (
                        <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                          ONLINE
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold",
                          pipelinePillClass(lead.status as LeadStatus),
                        )}
                      >
                        <StatusIcon className="size-3" />
                        {pipelineShortLabel(lead.status as LeadStatus)}
                      </span>
                      {lead.customer?.isBuyer ? (
                        <span className="rounded bg-[#64748b] px-1.5 py-0.5 text-[10px] font-bold text-white">
                          Buyer
                        </span>
                      ) : null}
                      {lead.customer?.isSeller ? (
                        <span className="rounded bg-[#5a9a6e] px-1.5 py-0.5 text-[10px] font-bold text-white">
                          Seller
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-[#475569]">
                        <Star
                          className="size-3.5 fill-[#334155] text-[#334155]"
                          strokeWidth={0}
                        />
                        {lead.hotness}
                      </span>
                      {lead.binge ? (
                        <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                          <Flame className="size-3" />
                          Binge
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2.5 space-y-1 text-[13px] text-[#475569]">
                      {phone ? (
                        <a
                          href={`tel:${phone}`}
                          className="flex items-center gap-2 font-semibold text-[#2b6cb0]"
                        >
                          <Phone className="size-3.5 shrink-0" />
                          {phone}
                        </a>
                      ) : null}
                      {email ? (
                        <a
                          href={`mailto:${email}`}
                          className="flex items-center gap-2 truncate"
                        >
                          <Mail className="size-3.5 shrink-0" />
                          <span className="truncate">{email}</span>
                        </a>
                      ) : null}
                      {lead.priceCity || lead.listingMls ? (
                        <p className="truncate text-[12px]">
                          {lead.priceCity || `MLS® ${lead.listingMls}`}
                        </p>
                      ) : null}
                      {purchaseTimeframeLabel(
                        lead.customer?.purchaseTimeframe,
                      ) ? (
                        <p className="text-[12px]">
                          Timeframe:{" "}
                          <span className="font-semibold text-[#334155]">
                            {purchaseTimeframeLabel(
                              lead.customer?.purchaseTimeframe,
                            )}
                          </span>
                        </p>
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-[#eef2f6] pt-2.5 text-[11px] text-[#64748b]">
                      <span className="inline-flex items-center gap-1">
                        <Eye className="size-3" />
                        {lead.views24h} views
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Heart className="size-3" />
                        {lead.saves} saves
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Search className="size-3" />
                        {lead.searches} searches
                      </span>
                      {lead.nextReminder ? (
                        <span className="font-semibold text-[#d97706]">
                          Reminder{" "}
                          {new Date(lead.nextReminder).toLocaleString("en-CA", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => openLead(lead.id)}
                        className="flex-1 rounded-lg bg-[#2b6cb0] px-3 py-2.5 text-[13px] font-semibold text-white active:bg-[#245a96]"
                      >
                        Open profile
                      </button>
                      {phone ? (
                        <a
                          href={`tel:${phone}`}
                          className="inline-flex items-center justify-center rounded-lg border border-[#d8dee6] px-3 py-2.5 text-[#1e2a38] active:bg-[#f8fafc]"
                          aria-label={`Call ${name}`}
                        >
                          <Phone className="size-4" />
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      <div className="hidden overflow-x-auto rounded border border-[#d8dee6] bg-white lg:block">
        <table className="min-w-[1200px] w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-[#e2e8f0] bg-[#f8fafc] text-[10px] font-bold">
              <th className="w-8 px-2 py-2.5" />
              <SortHeader label="Name/Info" column="name" />
              <th className="w-10 px-1 py-2.5" />
              <SortHeader label="Pipeline" column="pipeline" />
              <SortHeader label="Registered" column="registered" />
              <SortHeader label="City" column="priceCity" />
              <SortHeader label="Timeframe" column="timeframe" />
              <SortHeader label="Last Login" column="lastLogin" />
              <SortHeader label="Last Touch" column="lastTouch" />
              <SortHeader label="Next Reminder" column="nextReminder" />
              <SortHeader label="Activity" column="activity" />
              <SortHeader label="Assigned To" column="assigned" />
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={12}
                  className="px-4 py-16 text-center text-sm text-[#94a3b8]"
                >
                  No leads in this view.
                </td>
              </tr>
            ) : (
              pageRows.map((lead) => {
                const name =
                  lead.customer?.name ||
                  lead.customer?.email ||
                  lead.source.replaceAll("_", " ");
                const phone = lead.customer?.phone;
                const email = lead.customer?.email;
                return (
                  <tr
                    key={lead.id}
                    className="border-b border-[#eef2f6] align-top hover:bg-[#f8fafc]"
                  >
                    <td className="px-2 py-3">
                      <input
                        type="checkbox"
                        checked={selected.includes(lead.id)}
                        onChange={() => toggle(lead.id)}
                        className="size-3.5"
                      />
                    </td>

                    <td className="px-2 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openLead(lead.id)}
                          className="text-left text-[13px] font-bold text-[#4a6f94] hover:underline"
                        >
                          {name}
                        </button>
                        {lead.customer ? (
                          <LeadAccountVerifyMenu
                            compact
                            leadId={lead.id}
                            emailVerified={contactVerified(lead, "email")}
                            accountCreatedAt={lead.customer.createdAt}
                            onVerifiedChange={(verified) => {
                              setVerifyState((prev) => ({
                                ...prev,
                                [lead.id]: {
                                  emailVerified: verified,
                                  phoneVerified:
                                    prev[lead.id]?.phoneVerified ??
                                    lead.customer?.phoneVerified ??
                                    false,
                                },
                              }));
                            }}
                          />
                        ) : null}
                      </div>
                      <div className="mt-1 space-y-1">
                        <div className="relative flex items-center gap-1.5 text-[11px] text-[#6b8499]">
                          <button
                            type="button"
                            disabled={!phone}
                            title={
                              !phone
                                ? "No phone on file"
                                : contactVerified(lead, "phone")
                                  ? "Mark phone unverified"
                                  : "Mark phone verified"
                            }
                            onClick={() => void toggleVerify(lead, "phone")}
                            className="shrink-0 rounded-sm p-0.5 transition hover:bg-[#f1f5f9] disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
                          >
                            {phone && contactVerified(lead, "phone") ? (
                              <CircleCheck
                                className="size-3.5 text-[#6a9e7d]"
                                strokeWidth={2}
                              />
                            ) : (
                              <TriangleAlert
                                className="size-3.5 text-[#d4a574]"
                                strokeWidth={2}
                              />
                            )}
                          </button>
                          {phone ? (
                            <a
                              href={`tel:${phone}`}
                              className="min-w-0 truncate hover:underline"
                            >
                              {phone}
                            </a>
                          ) : (
                            <span className="text-[#94a3b8]">N/A</span>
                          )}
                          <button
                            type="button"
                            disabled={!phone}
                            onClick={() =>
                              setPhoneMenuId((id) =>
                                id === lead.id ? null : lead.id,
                              )
                            }
                            className="shrink-0 rounded-sm p-0.5 text-[#4a6f94] hover:bg-[#f1f5f9] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
                            aria-label="Phone actions"
                          >
                            <ChevronDown className="size-3" />
                          </button>
                          {phone && phoneMenuId === lead.id ? (
                            <>
                              <button
                                type="button"
                                className="fixed inset-0 z-20 cursor-default"
                                aria-label="Close phone menu"
                                onClick={() => setPhoneMenuId(null)}
                              />
                              <div className="absolute left-5 top-full z-30 mt-1 w-28 rounded-md border border-[#e2e8f0] bg-white py-1 shadow-lg">
                                <a
                                  href={`tel:${phone}`}
                                  className="block px-3 py-1.5 text-[11px] font-semibold text-[#475569] hover:bg-[#f8fafc]"
                                  onClick={() => setPhoneMenuId(null)}
                                >
                                  Call
                                </a>
                                <a
                                  href={`sms:${phone}`}
                                  className="block px-3 py-1.5 text-[11px] font-semibold text-[#475569] hover:bg-[#f8fafc]"
                                  onClick={() => setPhoneMenuId(null)}
                                >
                                  Text
                                </a>
                                <button
                                  type="button"
                                  className="block w-full px-3 py-1.5 text-left text-[11px] font-semibold text-[#475569] hover:bg-[#f8fafc]"
                                  onClick={() => {
                                    void navigator.clipboard?.writeText(phone);
                                    setPhoneMenuId(null);
                                  }}
                                >
                                  Copy
                                </button>
                              </div>
                            </>
                          ) : null}
                        </div>
                        {email ? (
                          <div className="flex items-center gap-1.5 text-[11px] text-[#6b8499]">
                            <button
                              type="button"
                              title={
                                contactVerified(lead, "email")
                                  ? "Mark email unverified"
                                  : "Mark email verified"
                              }
                              onClick={() => void toggleVerify(lead, "email")}
                              className="shrink-0 rounded-sm p-0.5 transition hover:bg-[#f1f5f9]"
                            >
                              {contactVerified(lead, "email") ? (
                                <CircleCheck
                                  className="size-3.5 text-[#6a9e7d]"
                                  strokeWidth={2}
                                />
                              ) : (
                                <TriangleAlert
                                  className="size-3.5 text-[#d4a574]"
                                  strokeWidth={2}
                                />
                              )}
                            </button>
                            <a
                              href={`mailto:${email}`}
                              className="min-w-0 max-w-[160px] truncate hover:underline"
                              title={email}
                            >
                              {email}
                            </a>
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-[#475569]"
                          title="Hot Score"
                        >
                          <Star
                            className="size-3.5 fill-[#334155] text-[#334155]"
                            strokeWidth={0}
                          />
                          {lead.hotness}
                        </span>
                        {lead.customer?.isBuyer ? (
                          <span className="rounded bg-[#64748b] px-1.5 py-0.5 text-[10px] font-bold text-white">
                            Buyer
                          </span>
                        ) : null}
                        {lead.customer?.isSeller ? (
                          <span className="rounded bg-[#5a9a6e] px-1.5 py-0.5 text-[10px] font-bold text-white">
                            Seller
                          </span>
                        ) : null}
                      </div>
                    </td>

                    <td className="px-1 py-3">
                      {lead.isOnline ? (
                        <span
                          className="inline-flex size-6 items-center justify-center rounded-full bg-[#f5e9b8] text-[11px] font-semibold leading-none text-[#8a7340]"
                          title="Online"
                        >
                          B
                        </span>
                      ) : lead.binge ? (
                        <span
                          className="inline-flex size-6 items-center justify-center rounded-full bg-[#b7d4e8] text-[#3d5f78]"
                          title="Binge browsing"
                        >
                          <Plus className="size-3.5 shrink-0" strokeWidth={2.5} />
                        </span>
                      ) : (
                        <span className="inline-flex size-6 items-center justify-center rounded-full border border-[#e8edf2] text-[#cbd5e1]">
                          <Plus className="size-3 shrink-0" strokeWidth={2.25} />
                        </span>
                      )}
                    </td>

                    <td className="px-2 py-3">
                      <div className="relative inline-block">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            setPipelineOpenId((id) =>
                              id === lead.id ? null : lead.id,
                            )
                          }
                          className={cn(
                            "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide transition hover:opacity-90 disabled:opacity-50",
                            pipelinePillClass(lead.status),
                          )}
                        >
                          {(() => {
                            const StatusIcon = pipelineIcon(lead.status);
                            return (
                              <StatusIcon
                                className="size-3 shrink-0 opacity-80"
                                strokeWidth={2.25}
                              />
                            );
                          })()}
                          {pipelineShortLabel(lead.status)}
                          <ChevronDown className="size-3 shrink-0 opacity-70" />
                        </button>
                        {pipelineOpenId === lead.id ? (
                          <>
                            <button
                              type="button"
                              className="fixed inset-0 z-20 cursor-default"
                              aria-label="Close pipeline menu"
                              onClick={() => setPipelineOpenId(null)}
                            />
                            <div className="absolute left-0 top-full z-30 mt-1 max-h-56 w-48 overflow-y-auto rounded-md border border-[#e2e8f0] bg-white py-1 shadow-lg">
                              {STATUSES.map((s) => {
                                const StatusIcon = pipelineIcon(s);
                                return (
                                  <button
                                    key={s}
                                    type="button"
                                    disabled={pending || s === lead.status}
                                    onClick={() => {
                                      setPipelineOpenId(null);
                                      if (s !== lead.status) {
                                        void patchLead(lead.id, { status: s });
                                      }
                                    }}
                                    className={cn(
                                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] font-semibold hover:bg-[#f8fafc] disabled:opacity-40",
                                      s === lead.status
                                        ? "text-[#94a3b8]"
                                        : "text-[#475569]",
                                    )}
                                  >
                                    <StatusIcon
                                      className="size-3.5 shrink-0 opacity-75"
                                      strokeWidth={2}
                                    />
                                    {pipelineLabel(s)}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        ) : null}
                      </div>
                      {canClaimPond && !lead.assignedAgentId ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => void patchLead(lead.id, { claim: true })}
                          className="mt-1 block text-[11px] font-semibold text-[#5b9aaa] hover:underline"
                        >
                          Claim
                        </button>
                      ) : null}
                    </td>

                    <td className="px-2 py-3 text-[12px] text-[#334155]">
                      <p className="font-semibold">{relativeShort(lead.createdAt)}</p>
                      <p className="text-[11px] capitalize text-[#94a3b8]">
                        {sourceLabel(lead.source)}
                      </p>
                    </td>

                    <td className="px-2 py-3 text-[12px] text-[#334155]">
                      <p className="font-medium">
                        {lead.priceCity ||
                          (lead.listingMls ? `MLS ${lead.listingMls}` : "n/a")}
                      </p>
                    </td>

                    <td className="px-2 py-3 text-[12px] text-[#64748b]">
                      {purchaseTimeframeLabel(
                        lead.customer?.purchaseTimeframe,
                      ) ?? "—"}
                    </td>

                    <td className="px-2 py-3 text-[12px] text-[#334155]">
                      <p className="font-semibold">
                        {relativeShort(lead.lastSeenAt)}
                      </p>
                      <p className="text-[11px] text-[#94a3b8]">
                        {lead.loginCount} Total
                      </p>
                    </td>

                    <td className="px-2 py-3 text-[12px] text-[#334155]">
                      <p className="font-semibold">
                        {relativeShort(
                          lead.firstRespondedAt || lead.updatedAt,
                        )}
                      </p>
                      <div className="mt-1 flex items-center gap-1.5 text-[#b0bac5]">
                        {phone ? (
                          <a href={`tel:${phone}`} title="Call">
                            <Phone className="size-3.5 hover:text-[#5b9aaa]" />
                          </a>
                        ) : (
                          <Phone className="size-3.5 opacity-30" />
                        )}
                        {email ? (
                          <a href={`mailto:${email}`} title="Email">
                            <Mail className="size-3.5 hover:text-[#5a7fa3]" />
                          </a>
                        ) : (
                          <Mail className="size-3.5 opacity-30" />
                        )}
                        {phone ? (
                          <a href={`sms:${phone}`} title="Text">
                            <MessageSquare className="size-3.5 hover:text-[#7aa8c4]" />
                          </a>
                        ) : (
                          <MessageSquare className="size-3.5 opacity-30" />
                        )}
                      </div>
                    </td>

                    <td className="px-2 py-3 text-[12px]">
                      <Link
                        href={openLeadProfileHref(lead.id, { view })}
                        className="font-semibold text-[#5a7fa3] hover:underline"
                      >
                        {lead.nextReminder
                          ? relativeShort(lead.nextReminder)
                          : "n/a"}
                      </Link>
                      <p className="text-[11px] text-[#94a3b8]">
                        {lead.openTaskCount} Total
                      </p>
                    </td>

                    <td className="px-2 py-3">
                      <div className="flex flex-col gap-1 text-[11px] font-semibold leading-none">
                        <span
                          className="inline-flex items-center gap-1.5 text-[#6a9e7d]"
                          title="Views (24h)"
                        >
                          <Eye className="size-3.5 shrink-0" strokeWidth={2} />
                          {lead.views24h} Views
                        </span>
                        <span
                          className="inline-flex items-center gap-1.5 text-[#c4926a]"
                          title="Saved searches"
                        >
                          <Search className="size-3.5 shrink-0" strokeWidth={2} />
                          {lead.searches} Saved
                        </span>
                        <span
                          className="inline-flex items-center gap-1.5 text-[#c47878]"
                          title="Saved homes"
                        >
                          <Heart className="size-3.5 shrink-0" strokeWidth={2} />
                          {lead.saves} Fav
                        </span>
                        <span
                          className="inline-flex items-center gap-1.5 text-[#5a7fa3]"
                          title="Inquiries"
                        >
                          <MessageSquare
                            className="size-3.5 shrink-0"
                            strokeWidth={2}
                          />
                          {lead.inquiries} Inq
                        </span>
                      </div>
                    </td>

                    <td className="px-2 py-3 text-[12px] text-[#334155]">
                      {canAssign ? (
                        <select
                          value={lead.assignedAgentId ?? ""}
                          disabled={pending}
                          onChange={(e) =>
                            void assignLeads(
                              [lead.id],
                              e.target.value || null,
                            )
                          }
                          className="max-w-[140px] rounded border border-[#d8dee6] bg-white px-1.5 py-1 text-[11px] text-[#334155]"
                          aria-label="Assign agent"
                        >
                          <option value="">Pond</option>
                          {teamMembers.map((m) => (
                            <option key={m.user.id} value={m.user.id}>
                              {m.user.name || m.user.email}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[12px] text-[#334155]">
                          {lead.assignedAgent?.name ||
                            lead.assignedAgent?.email ||
                            "Unassigned"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {addOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-[#1e2a38]/40"
            aria-label="Close"
            onClick={() => setAddOpen(false)}
          />
          <form
            onSubmit={createLead}
            className="relative z-10 w-full max-w-md space-y-3 rounded-xl border border-[#d8dee6] bg-white p-5 shadow-xl"
          >
            <h3 className="text-[16px] font-bold text-[#1e2a38]">
              Add New Lead
            </h3>
            <input
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="Full name"
              required
              className="w-full rounded-md border border-[#d8dee6] px-3 py-2 text-sm"
            />
            <input
              type="email"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-full rounded-md border border-[#d8dee6] px-3 py-2 text-sm"
            />
            <input
              value={addPhone}
              onChange={(e) => setAddPhone(e.target.value)}
              placeholder="Phone (optional)"
              className="w-full rounded-md border border-[#d8dee6] px-3 py-2 text-sm"
            />
            {addError ? (
              <p className="text-xs text-[#e11d48]">{addError}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-[#64748b]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md bg-[#5b9aaa] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                Create lead
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
