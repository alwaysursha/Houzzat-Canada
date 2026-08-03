"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSiteAlert } from "@/components/feedback/SiteAlertProvider";
import { cn } from "@/lib/utils";

type Agent = { id: string; name: string | null; email: string };
type WeightRow = {
  agentId: string;
  percent: number;
  assignedCount: number;
  agent: Agent;
};

export function LeadRoutingAdminClient({
  initial,
}: {
  initial: {
    agents: Agent[];
    listingAgentId: string | null;
    sellerAssignMode: "LISTING_AGENT" | "PERCENTAGE";
    buyerWeights: WeightRow[];
    sellerWeights: WeightRow[];
  };
}) {
  const router = useRouter();
  const { toast } = useSiteAlert();
  const [pending, setPending] = useState(false);
  const [listingAgentId, setListingAgentId] = useState(
    initial.listingAgentId ?? initial.agents[0]?.id ?? "",
  );
  const [sellerAssignMode, setSellerAssignMode] = useState<
    "LISTING_AGENT" | "PERCENTAGE"
  >(initial.sellerAssignMode);
  const [buyerPercents, setBuyerPercents] = useState<Record<string, number>>(
    () => Object.fromEntries(initial.buyerWeights.map((w) => [w.agentId, w.percent])),
  );
  const [sellerPercents, setSellerPercents] = useState<Record<string, number>>(
    () =>
      Object.fromEntries(initial.sellerWeights.map((w) => [w.agentId, w.percent])),
  );

  const buyerSum = useMemo(
    () => initial.agents.reduce((s, a) => s + (buyerPercents[a.id] ?? 0), 0),
    [initial.agents, buyerPercents],
  );
  const sellerSum = useMemo(
    () => initial.agents.reduce((s, a) => s + (sellerPercents[a.id] ?? 0), 0),
    [initial.agents, sellerPercents],
  );

  function splitEven(setter: (v: Record<string, number>) => void) {
    const n = initial.agents.length;
    if (n === 0) return;
    const base = Math.floor(100 / n);
    const rem = 100 - base * n;
    const next: Record<string, number> = {};
    initial.agents.forEach((a, i) => {
      next[a.id] = base + (i === 0 ? rem : 0);
    });
    setter(next);
  }

  async function save() {
    if (initial.agents.length > 1 && buyerSum !== 100) {
      toast({
        message: `Buyer routing must total 100% (now ${buyerSum}%).`,
        tone: "error",
      });
      return;
    }
    if (
      sellerAssignMode === "PERCENTAGE" &&
      initial.agents.length > 1 &&
      sellerSum !== 100
    ) {
      toast({
        message: `Seller routing must total 100% (now ${sellerSum}%).`,
        tone: "error",
      });
      return;
    }

    setPending(true);
    const res = await fetch("/api/admin/lead-routing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listingAgentId: listingAgentId || null,
        sellerAssignMode,
        buyerWeights: initial.agents.map((a) => ({
          agentId: a.id,
          percent: buyerPercents[a.id] ?? 0,
        })),
        sellerWeights: initial.agents.map((a) => ({
          agentId: a.id,
          percent: sellerPercents[a.id] ?? 0,
        })),
      }),
    });
    setPending(false);
    const data = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (!res.ok) {
      toast({ message: data?.error ?? "Couldn’t save routing", tone: "error" });
      return;
    }
    toast({ message: "Lead routing saved", tone: "success" });
    router.refresh();
  }

  if (initial.agents.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
        No active agents found. Create an agent user (role AGENT) before
        configuring routing. New leads will stay in the pond until then.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
        <h2 className="font-display text-xl text-ink">Listing agent</h2>
        <p className="mt-1 text-sm text-ink/60">
          Default assignee for seller leads when seller mode is “Listing
          agent”. Buyer+seller leads use the seller path.
        </p>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-ink/50">
          Default listing agent
        </label>
        <select
          value={listingAgentId}
          onChange={(e) => setListingAgentId(e.target.value)}
          className="mt-1.5 w-full max-w-md rounded-lg border border-line bg-mist/40 px-3 py-2.5 text-sm font-medium text-ink"
        >
          {initial.agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name || a.email}
            </option>
          ))}
        </select>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
        <h2 className="font-display text-xl text-ink">Seller lead assignment</h2>
        <p className="mt-1 text-sm text-ink/60">
          Choose listing-agent routing, or percentage routing like buyers.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ["LISTING_AGENT", "Listing agent (default)"],
              ["PERCENTAGE", "Percentage routing"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSellerAssignMode(value)}
              className={cn(
                "rounded-lg border px-3.5 py-2 text-sm font-semibold transition",
                sellerAssignMode === value
                  ? "border-canopy bg-canopy text-white"
                  : "border-line bg-mist/50 text-ink hover:border-canopy/40",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <WeightEditor
        title="Buyer lead routing"
        hint={
          initial.agents.length === 1
            ? "Only one agent — all buyer leads auto-assign to them."
            : "Percentages must total 100%. Leads are distributed fairly using these weights."
        }
        agents={initial.agents}
        percents={buyerPercents}
        onChange={setBuyerPercents}
        sum={buyerSum}
        onEven={() => splitEven(setBuyerPercents)}
        disabled={initial.agents.length < 2}
      />

      <WeightEditor
        title="Seller lead routing"
        hint={
          sellerAssignMode === "LISTING_AGENT"
            ? "Inactive while listing-agent mode is selected — used if you switch to percentage."
            : initial.agents.length === 1
              ? "Only one agent — all seller leads auto-assign to them."
              : "Percentages must total 100% for seller leads."
        }
        agents={initial.agents}
        percents={sellerPercents}
        onChange={setSellerPercents}
        sum={sellerSum}
        onEven={() => splitEven(setSellerPercents)}
        disabled={
          initial.agents.length < 2 || sellerAssignMode === "LISTING_AGENT"
        }
      />

      <div className="flex justify-end">
        <button
          type="button"
          disabled={pending}
          onClick={() => void save()}
          className="rounded-lg bg-canopy px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-canopy-deep disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save routing"}
        </button>
      </div>
    </div>
  );
}

function WeightEditor({
  title,
  hint,
  agents,
  percents,
  onChange,
  sum,
  onEven,
  disabled,
}: {
  title: string;
  hint: string;
  agents: Agent[];
  percents: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  sum: number;
  onEven: () => void;
  disabled?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-line bg-white p-5 shadow-sm",
        disabled && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-ink">{title}</h2>
          <p className="mt-1 text-sm text-ink/60">{hint}</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "text-sm font-semibold tabular-nums",
              sum === 100 ? "text-canopy" : "text-amber-700",
            )}
          >
            Total {sum}%
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={onEven}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-mist disabled:cursor-not-allowed"
          >
            Split evenly
          </button>
        </div>
      </div>
      <ul className="mt-4 divide-y divide-line/60">
        {agents.map((agent) => (
          <li
            key={agent.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">
                {agent.name || agent.email}
              </p>
              {agent.name ? (
                <p className="truncate text-xs text-ink/45">{agent.email}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                disabled={disabled}
                value={percents[agent.id] ?? 0}
                onChange={(e) => {
                  const n = Math.max(
                    0,
                    Math.min(100, Number(e.target.value) || 0),
                  );
                  onChange({ ...percents, [agent.id]: n });
                }}
                className="w-20 rounded-lg border border-line bg-mist/40 px-2.5 py-2 text-right text-sm font-semibold tabular-nums"
              />
              <span className="text-sm font-medium text-ink/50">%</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
