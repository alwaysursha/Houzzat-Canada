"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_ACTIVITY_FILTER_IDS,
  isDefaultActivityFilters,
  type TimelineScope,
} from "@/lib/agent/activity-filters";
import { fetchV2Json } from "@/lib/agent/lead-profile-v2/fetch-json";
import {
  isV2AbortError,
  type LeadProfileV2Session,
} from "@/lib/agent/lead-profile-v2/request-gate";
import {
  V2_TIMELINE_RESOURCE_KEY,
  buildV2TimelineSearchParams,
  canApplyV2TimelineResponse,
  mergeV2TimelineRows,
  shouldSkipDuplicateV2TimelineAppend,
  v2ActivityFilterAction,
  v2TimelineAppendCursorKey,
  v2TimelineFilterKey,
} from "@/lib/agent/lead-profile-v2/timeline-query";
import type {
  LeadProfileV2TimelineItem,
  LeadProfileV2TimelinePage,
} from "@/lib/agent/lead-profile-v2/types";

type TimelineFetchInput = {
  scope: TimelineScope;
  before?: string | null;
  append: boolean;
  filters: Set<string>;
};

export function useLeadProfileV2Timeline(
  session: LeadProfileV2Session,
  leadId: string,
) {
  const [rows, setRows] = useState<LeadProfileV2TimelineItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [scope, setScope] = useState<TimelineScope>("recent");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [filters, setFilters] = useState(
    () => new Set(DEFAULT_ACTIVITY_FILTER_IDS),
  );

  const leadIdRef = useRef(leadId);
  const epochRef = useRef(0);
  const defaultRecentRef = useRef<LeadProfileV2TimelinePage | null>(null);
  const lastAppendCursorKeyRef = useRef<string | null>(null);
  const [activeLeadId, setActiveLeadId] = useState(leadId);

  if (leadId !== activeLeadId) {
    setActiveLeadId(leadId);
    setHasMore(false);
    setScope("recent");
    setError(false);
    setBusy(true);
  }

  const fetchPage = useCallback(
    (input: TimelineFetchInput) => {
      const filterKey = v2TimelineFilterKey(input.filters);
      const run = () => {
        const stamp = { leadId, epoch: epochRef.current };
        return async (id: string, signal: AbortSignal) => {
          const apply = () =>
            canApplyV2TimelineResponse({
              stamp,
              current: { leadId: leadIdRef.current, epoch: epochRef.current },
            });
          setBusy(true);
          setError(false);
          try {
            const params = buildV2TimelineSearchParams({
              scope: input.scope,
              before: input.before,
              filters: input.filters,
            });
            const page = await fetchV2Json<LeadProfileV2TimelinePage>(
              `/api/agent/leads-v2/${id}/timeline?${params.toString()}`,
              "/api/agent/leads-v2/[id]/timeline",
              signal,
            );
            if (!apply() || signal.aborted) return;
            setScope(page.scope);
            setHasMore(page.hasMore);
            setRows((prev) =>
              mergeV2TimelineRows(prev, page.items, input.append),
            );
            if (
              !input.append &&
              isDefaultActivityFilters(input.filters) &&
              page.scope === "recent"
            ) {
              defaultRecentRef.current = page;
            }
          } catch (err) {
            if (isV2AbortError(err) || signal.aborted) return;
            if (!apply()) return;
            setError(true);
          } finally {
            if (apply()) setBusy(false);
          }
        };
      };

      if (input.append) {
        const cursorKey = v2TimelineAppendCursorKey({
          leadId,
          scope: input.scope,
          filterKey,
          before: input.before ?? null,
        });
        if (
          shouldSkipDuplicateV2TimelineAppend({
            inFlight: session.inspect(V2_TIMELINE_RESOURCE_KEY).inFlight,
            lastCursorKey: lastAppendCursorKeyRef.current,
            cursorKey,
          })
        ) {
          return;
        }
        if (
          !session.requestIfIdle(V2_TIMELINE_RESOURCE_KEY, leadId, run())
        ) {
          return;
        }
        lastAppendCursorKeyRef.current = cursorKey;
        return;
      }

      epochRef.current += 1;
      lastAppendCursorKeyRef.current = null;
      session.abort(V2_TIMELINE_RESOURCE_KEY);
      session.request(V2_TIMELINE_RESOURCE_KEY, leadId, run());
    },
    [leadId, session],
  );

  useEffect(() => {
    leadIdRef.current = leadId;
    defaultRecentRef.current = null;
    lastAppendCursorKeyRef.current = null;
    fetchPage({
      scope: "recent",
      append: false,
      filters: new Set(DEFAULT_ACTIVITY_FILTER_IDS),
    });
  }, [leadId, fetchPage]);

  const reloadDefault = useCallback(() => {
    fetchPage({
      scope: "recent",
      append: false,
      filters: new Set(DEFAULT_ACTIVITY_FILTER_IDS),
    });
  }, [fetchPage]);

  const onFiltersChange = useCallback(
    (next: Set<string>) => {
      setFilters(next);
      const action = v2ActivityFilterAction(next);
      switch (action.type) {
        case "restore-recent": {
          epochRef.current += 1;
          lastAppendCursorKeyRef.current = null;
          session.abort(V2_TIMELINE_RESOURCE_KEY);
          const cached = defaultRecentRef.current;
          setScope("recent");
          setError(false);
          if (cached) {
            setRows(cached.items);
            setHasMore(cached.hasMore);
            setBusy(false);
            return;
          }
          fetchPage({
            scope: "recent",
            append: false,
            filters: next,
          });
          return;
        }
        case "fetch-history":
          fetchPage({
            scope: "history",
            append: false,
            filters: next,
          });
          return;
        default: {
          const _exhaustive: never = action;
          return _exhaustive;
        }
      }
    },
    [fetchPage, session],
  );

  const loadMore = useCallback(() => {
    fetchPage({
      scope,
      before: rows[rows.length - 1]?.createdAt ?? null,
      append: true,
      filters,
    });
  }, [fetchPage, filters, rows, scope]);

  const viewAll = useCallback(() => {
    fetchPage({
      scope: "history",
      before: rows[rows.length - 1]?.createdAt ?? null,
      append: true,
      filters,
    });
  }, [fetchPage, filters, rows]);

  const emptyMessage = useMemo(() => {
    if (busy && rows.length === 0) return "Loading…";
    if (error && rows.length === 0) return "Failed to load";
    if (rows.length === 0) return "No activity yet.";
    return "No activity matches these filters. Adjust Filters to see more.";
  }, [busy, error, rows.length]);

  return {
    rows,
    hasMore,
    scope,
    busy,
    error,
    filters,
    emptyMessage,
    onFiltersChange,
    loadMore,
    viewAll,
    reloadDefault,
  };
}
