"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Bell,
  ExternalLink,
  Loader2,
  Mail,
  MessageSquare,
  Search,
} from "lucide-react";
import {
  SearchCriteriaFields,
  criteriaSummaryChips,
  criteriaToQuery,
  parseCriteria,
  type CriteriaForm,
} from "@/components/agent/SearchCriteriaForm";
import { savedQueryToSearchHref } from "@/lib/agent/intent-to-search";
import { cn } from "@/lib/utils";

export function SavedSearchEditor({
  leadId,
  search,
  onUpdated,
}: {
  leadId: string;
  search: {
    id: string;
    name: string;
    emailAlerts: boolean;
    smsAlerts: boolean;
    isHomepageActive?: boolean;
    query: unknown;
  };
  onUpdated?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(search.name);
  const [emailAlerts, setEmailAlerts] = useState(search.emailAlerts);
  const [smsAlerts, setSmsAlerts] = useState(search.smsAlerts);
  const [isHomepageActive, setIsHomepageActive] = useState(
    Boolean(search.isHomepageActive),
  );
  const [form, setForm] = useState<CriteriaForm>(() =>
    parseCriteria(search.query),
  );
  const [showRaw, setShowRaw] = useState(false);
  const [rawText, setRawText] = useState(
    JSON.stringify(search.query ?? {}, null, 2),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const liveQuery = useMemo(
    () => criteriaToQuery(form, search.query),
    [form, search.query],
  );
  const listingsHref = savedQueryToSearchHref(liveQuery);
  const summaryChips = useMemo(() => criteriaSummaryChips(form), [form]);

  async function save() {
    setPending(true);
    setError(null);
    setSavedFlash(false);
    try {
      let query: Record<string, unknown>;
      if (showRaw) {
        try {
          query = JSON.parse(rawText) as Record<string, unknown>;
        } catch {
          setError("Advanced JSON is invalid");
          return;
        }
      } else {
        query = criteriaToQuery(form, search.query);
        setRawText(JSON.stringify(query, null, 2));
      }

      const res = await fetch("/api/agent/searches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          searchId: search.id,
          name: name.trim() || "Saved search",
          emailAlerts,
          smsAlerts,
          isHomepageActive,
          query,
        }),
      });
      if (!res.ok) {
        setError("Save failed");
        return;
      }
      if (showRaw) setForm(parseCriteria(query));
      setSavedFlash(true);
      router.refresh();
      onUpdated?.();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#d8dee6] bg-white shadow-[0_1px_2px_rgb(15_23_42/0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#eef2f6] bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#64748b]">
            <Search className="size-3" />
            Saved search
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border-0 bg-transparent p-0 text-[16px] font-semibold tracking-tight text-[#1e2a38] outline-none placeholder:text-[#94a3b8]"
            placeholder="Search name"
          />
        </div>
        <Link
          href={listingsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#bae6fd] bg-[#f0f9ff] px-3 py-1.5 text-[12px] font-semibold text-[#0369a1] transition hover:bg-[#e0f2fe]"
        >
          <ExternalLink className="size-3.5" />
          View listings
        </Link>
      </div>

      <div className="space-y-4 px-4 py-4">
        {!showRaw ? (
          <SearchCriteriaFields form={form} onChange={setForm} />
        ) : summaryChips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {summaryChips.map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-[#f1f5f9] px-2.5 py-1 text-[11px] font-semibold text-[#334155]"
              >
                {chip}
              </span>
            ))}
          </div>
        ) : null}

        <div className="rounded-xl border border-[#e8edf2] bg-[#f8fafc] px-3 py-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#64748b]">
            <Bell className="size-3" />
            Alerts & homepage
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEmailAlerts((v) => !v)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold transition",
                emailAlerts
                  ? "bg-[#ecfdf5] text-[#047857] ring-1 ring-[#a7f3d0]"
                  : "bg-white text-[#64748b] ring-1 ring-[#d8dee6]",
              )}
            >
              <Mail className="size-3.5" />
              Email alerts
              <span
                className={cn(
                  "size-2 rounded-full",
                  emailAlerts ? "bg-[#10b981]" : "bg-[#cbd5e1]",
                )}
              />
            </button>
            <button
              type="button"
              onClick={() => setSmsAlerts((v) => !v)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold transition",
                smsAlerts
                  ? "bg-[#eff6ff] text-[#1d4ed8] ring-1 ring-[#bfdbfe]"
                  : "bg-white text-[#64748b] ring-1 ring-[#d8dee6]",
              )}
            >
              <MessageSquare className="size-3.5" />
              SMS alerts
              <span
                className={cn(
                  "size-2 rounded-full",
                  smsAlerts ? "bg-[#3b82f6]" : "bg-[#cbd5e1]",
                )}
              />
            </button>
            <button
              type="button"
              onClick={() => setIsHomepageActive((v) => !v)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold transition",
                isHomepageActive
                  ? "bg-[#ecfdf5] text-[#047857] ring-1 ring-[#a7f3d0]"
                  : "bg-white text-[#64748b] ring-1 ring-[#d8dee6]",
              )}
            >
              Homepage search
              <span
                className={cn(
                  "size-2 rounded-full",
                  isHomepageActive ? "bg-[#10b981]" : "bg-[#cbd5e1]",
                )}
              />
            </button>
          </div>
          {isHomepageActive ? (
            <p className="mt-2 text-[11px] text-[#64748b]">
              Applied to this customer’s homepage rails (price, property type,
              cities).
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eef2f6] pt-3">
          <button
            type="button"
            onClick={() => {
              if (!showRaw) {
                setRawText(JSON.stringify(liveQuery, null, 2));
              } else {
                try {
                  setForm(parseCriteria(JSON.parse(rawText)));
                } catch {
                  /* keep form */
                }
              }
              setShowRaw((v) => !v);
            }}
            className="text-[11px] font-semibold text-[#94a3b8] hover:text-[#475569]"
          >
            {showRaw ? "Use visual filters" : "Advanced JSON"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void save()}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0f766e] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#0d9488] disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Save criteria
          </button>
        </div>

        {showRaw ? (
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={7}
            className="w-full rounded-xl border border-[#d8dee6] bg-[#0f172a] px-3 py-2.5 font-mono text-[11px] leading-relaxed text-[#e2e8f0] outline-none focus:ring-2 focus:ring-[#2b6cb0]/30"
          />
        ) : null}

        {error ? (
          <p className="text-[12px] font-medium text-[#e11d48]">{error}</p>
        ) : null}
        {savedFlash ? (
          <p className="text-[12px] font-medium text-[#047857]">
            Criteria saved.
          </p>
        ) : null}
      </div>
    </div>
  );
}
