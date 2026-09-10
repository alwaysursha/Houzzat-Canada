"use client";

import { useMemo, type ReactNode } from "react";
import { ActivityFilters } from "@/components/agent/ActivityFilters";
import { CrmTimeline } from "@/components/agent/CrmTimeline";
import {
  ALL_ACTIVITY_FILTER_IDS,
  filterIdsForTimelineType,
  timelineItemMatchesFilters,
} from "@/lib/agent/activity-filters";
import type { TimelineItem } from "@/lib/agent/customer-timeline";
import type { LeadProfileV2TimelineItem } from "@/lib/agent/lead-profile-v2/types";
import { cn } from "@/lib/utils";

export function LeadProfileV2ActivityPanel({
  rows,
  hasMore,
  scope,
  busy,
  filters,
  emptyMessage,
  onFiltersChange,
  onLoadMore,
  onViewAll,
}: {
  rows: LeadProfileV2TimelineItem[];
  hasMore: boolean;
  scope: "recent" | "history";
  busy: boolean;
  filters: Set<string>;
  emptyMessage: string;
  onFiltersChange: (next: Set<string>) => void;
  onLoadMore: () => void;
  onViewAll: () => void;
}) {
  const timelineItems = useMemo(
    () => hydrateV2TimelineItems(rows),
    [rows],
  );

  const activityFilterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const id of ALL_ACTIVITY_FILTER_IDS) counts[id] = 0;
    for (const item of timelineItems) {
      for (const id of filterIdsForTimelineType(item.type)) {
        counts[id] = (counts[id] ?? 0) + 1;
      }
    }
    return counts;
  }, [timelineItems]);

  const filteredTimelineItems = useMemo(
    () =>
      timelineItems.filter((item) =>
        timelineItemMatchesFilters(item.type, filters),
      ),
    [timelineItems, filters],
  );

  return (
    <Panel title="Activity">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-xl text-[12px] leading-relaxed text-[#64748b]">
          Day-by-day timeline of alerts, emails, views, and team touches — use
          chips to focus, Filters for detail.
        </p>
        <ActivityFilters
          selected={filters}
          onChange={onFiltersChange}
          counts={activityFilterCounts}
        />
      </div>
      <CrmTimeline items={filteredTimelineItems} empty={emptyMessage} />
      <div className="mt-4 flex flex-wrap gap-2">
        {hasMore ? (
          <button
            type="button"
            disabled={busy}
            onClick={onLoadMore}
            className="rounded-lg border border-[#d8dee6] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#1e2a38] hover:bg-[#f8fafc] disabled:opacity-50"
          >
            {busy ? "Loading…" : "Load more"}
          </button>
        ) : null}
        {scope === "recent" ? (
          <button
            type="button"
            disabled={busy}
            onClick={onViewAll}
            className="rounded-lg bg-[#1e2a38] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#334155] disabled:opacity-50"
          >
            View all
          </button>
        ) : null}
      </div>
    </Panel>
  );
}

function hydrateV2TimelineItems(
  items: LeadProfileV2TimelineItem[],
): TimelineItem[] {
  return items.map((item) => ({
    ...item,
    source: item.source as TimelineItem["source"],
    createdAt: new Date(item.createdAt),
    pinnedAt: item.pinnedAt ? new Date(item.pinnedAt) : null,
    emailOpenedAt: item.emailOpenedAt
      ? new Date(item.emailOpenedAt)
      : null,
    emailClickedAt: item.emailClickedAt
      ? new Date(item.emailClickedAt)
      : null,
  }));
}

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-[#e2e8f0] bg-white px-4 py-3",
        className,
      )}
    >
      <h3 className="mb-3 text-[13px] font-bold text-[#1e2a38]">{title}</h3>
      {children}
    </section>
  );
}
