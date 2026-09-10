/**
 * Client/server-safe Activity query helpers. No Prisma.
 * Scope/filter/cursor contract matches the current Lead Profile Activity tab.
 */
import { isDefaultActivityFilters, type TimelineScope } from "@/lib/agent/activity-filters";
import type { LeadProfileV2TimelineItem } from "@/lib/agent/lead-profile-v2/types";

export const V2_TIMELINE_RESOURCE_KEY = "timeline";
export const V2_TIMELINE_RECENT_DAYS = 4;
export const V2_TIMELINE_PAGE_SIZE = 40;

export type V2TimelineStamp = {
  leadId: string;
  epoch: number;
  filterKey: string;
  scope: TimelineScope;
  before: string | null;
  append: boolean;
};

export type V2TimelineFilterAction =
  | { type: "restore-recent" }
  | { type: "fetch-history"; filterIds: string[] };

export function v2TimelineFilterKey(filters: Iterable<string>): string {
  return [...filters].sort().join(",");
}

export function resolveV2TimelineScope(
  requested: TimelineScope,
  filterIds: string[] | null,
): TimelineScope {
  if (filterIds && !isDefaultActivityFilters(filterIds)) return "history";
  return requested;
}

export function parseV2TimelineSearchParams(url: URL): {
  scope: TimelineScope;
  before: Date | null;
  filterIds: string[] | null;
} {
  const scopeRaw = url.searchParams.get("scope");
  const requested: TimelineScope = scopeRaw === "history" ? "history" : "recent";
  const beforeRaw = url.searchParams.get("before");
  const parsedBefore = beforeRaw ? new Date(beforeRaw) : null;
  const filtersRaw = url.searchParams.get("filters");
  const filterIds = filtersRaw
    ? filtersRaw
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : null;
  return {
    scope: resolveV2TimelineScope(requested, filterIds),
    before:
      parsedBefore && !Number.isNaN(parsedBefore.getTime())
        ? parsedBefore
        : null,
    filterIds,
  };
}

export function buildV2TimelineSearchParams(input: {
  scope: TimelineScope;
  before?: string | null;
  filters: Iterable<string>;
}): URLSearchParams {
  const params = new URLSearchParams({ scope: input.scope });
  if (input.before) params.set("before", input.before);
  if (!isDefaultActivityFilters(input.filters)) {
    params.set("filters", [...input.filters].join(","));
  }
  return params;
}

export function v2ActivityFilterAction(
  nextFilters: Iterable<string>,
): V2TimelineFilterAction {
  if (isDefaultActivityFilters(nextFilters)) {
    return { type: "restore-recent" };
  }
  return { type: "fetch-history", filterIds: [...nextFilters] };
}

export function canApplyV2TimelineResponse(input: {
  stamp: Pick<V2TimelineStamp, "leadId" | "epoch">;
  current: Pick<V2TimelineStamp, "leadId" | "epoch">;
}): boolean {
  return (
    input.stamp.leadId === input.current.leadId &&
    input.stamp.epoch === input.current.epoch
  );
}

export function v2TimelineAppendCursorKey(input: {
  leadId: string;
  scope: TimelineScope;
  filterKey: string;
  before: string | null;
}): string {
  return `${input.leadId}|${input.scope}|${input.filterKey}|${input.before ?? ""}`;
}

export function shouldSkipDuplicateV2TimelineAppend(input: {
  inFlight: boolean;
  lastCursorKey: string | null;
  cursorKey: string;
}): boolean {
  if (input.inFlight) return true;
  return input.lastCursorKey === input.cursorKey;
}

export function mergeV2TimelineRows(
  prev: LeadProfileV2TimelineItem[],
  next: LeadProfileV2TimelineItem[],
  append: boolean,
): LeadProfileV2TimelineItem[] {
  if (!append) return next;
  const seen = new Set(prev.map((row) => row.id));
  return [...prev, ...next.filter((row) => !seen.has(row.id))];
}
