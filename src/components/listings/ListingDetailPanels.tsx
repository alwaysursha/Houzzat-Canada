"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ListingDetailTab =
  | "overview"
  | "details"
  | "history"
  | "insights"
  | "neighbourhood"
  | "sold";

const TABS: { id: ListingDetailTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "details", label: "Details" },
  { id: "history", label: "History" },
  { id: "insights", label: "Insights" },
  { id: "neighbourhood", label: "Neighbourhood" },
  { id: "sold", label: "Comparable Sold" },
];

/**
 * In-place listing sections. Panels stay mounted after the first visit so
 * tab changes do not refetch or scroll.
 */
export function ListingDetailPanels({
  overview,
  details,
  history,
  insights,
  neighbourhood,
  comparableSold,
  similarHomes,
  agentSection,
}: {
  overview: ReactNode;
  details: ReactNode;
  history: ReactNode;
  insights: ReactNode;
  neighbourhood: ReactNode;
  comparableSold: ReactNode;
  similarHomes: ReactNode;
  agentSection: ReactNode;
}) {
  const [tab, setTab] = useState<ListingDetailTab>("overview");
  const [seen, setSeen] = useState<Record<ListingDetailTab, boolean>>({
    overview: true,
    details: false,
    history: false,
    insights: false,
    neighbourhood: false,
    sold: false,
  });

  function selectTab(next: ListingDetailTab) {
    setTab(next);
    setSeen((current) =>
      current[next] ? current : { ...current, [next]: true },
    );
  }

  const panels: { id: ListingDetailTab; node: ReactNode }[] = [
    { id: "overview", node: overview },
    { id: "details", node: details },
    { id: "history", node: history },
    { id: "insights", node: insights },
    { id: "neighbourhood", node: neighbourhood },
    { id: "sold", node: comparableSold },
  ];

  return (
    <div className="min-w-0">
      <div
        role="tablist"
        aria-label="Listing sections"
        className="sticky top-0 z-[34] -mx-4 flex gap-2 overflow-x-auto border-b border-line/70 bg-white/95 px-4 py-2 backdrop-blur-md [scrollbar-width:none] md:static md:mx-0 md:gap-6 md:overflow-visible md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectTab(item.id)}
              className={cn(
                "inline-flex h-11 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold md:h-auto md:rounded-none md:px-0 md:pb-3 md:pt-1",
                active
                  ? "bg-canopy text-white md:border-b-2 md:border-canopy md:bg-transparent md:text-ink"
                  : "bg-mist/70 text-ink/70 md:border-b-2 md:border-transparent md:bg-transparent md:font-medium md:text-ink/55 md:hover:text-ink",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div className="pt-4">
        {panels.map((panel) =>
          seen[panel.id] ? (
            <div key={panel.id} hidden={tab !== panel.id}>
              {panel.node}
            </div>
          ) : null,
        )}
      </div>
      <div className="mt-8 space-y-6">
        {similarHomes}
        {agentSection}
      </div>
    </div>
  );
}
