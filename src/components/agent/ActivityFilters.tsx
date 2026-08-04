"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Filter, RotateCcw, X } from "lucide-react";
import {
  ACTIVITY_FILTER_GROUPS,
  ALL_ACTIVITY_FILTER_IDS,
  DEFAULT_ACTIVITY_FILTER_IDS,
  type ActivityFilterGroup,
} from "@/lib/agent/activity-filters";
import { useFlyoutFixedStyle } from "@/lib/use-flyout-fixed-style";
import { cn } from "@/lib/utils";

const PANEL_WIDTH = 720;

export function ActivityFilters({
  selected,
  onChange,
  counts,
}: {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Optional per-filter-id counts from the current timeline. */
  counts?: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const panelStyle = useFlyoutFixedStyle(open, buttonRef, PANEL_WIDTH);
  const portalStyle = panelStyle
    ? { ...panelStyle, zIndex: 120 }
    : undefined;

  const selectedCount = selected.size;
  const allSelected = selectedCount === ALL_ACTIVITY_FILTER_IDS.length;
  const isDefault =
    selectedCount === DEFAULT_ACTIVITY_FILTER_IDS.length &&
    DEFAULT_ACTIVITY_FILTER_IDS.every((id) => selected.has(id));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggleAll(on: boolean) {
    onChange(on ? new Set(ALL_ACTIVITY_FILTER_IDS) : new Set());
  }

  function toggleItem(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  function toggleGroup(group: ActivityFilterGroup) {
    const ids = group.items.map((i) => i.id);
    const allOn = ids.every((id) => selected.has(id));
    const next = new Set(selected);
    for (const id of ids) {
      if (allOn) next.delete(id);
      else next.add(id);
    }
    onChange(next);
  }

  function resetDefault() {
    onChange(new Set(DEFAULT_ACTIVITY_FILTER_IDS));
  }

  const summary = useMemo(() => {
    if (allSelected) return "All activity";
    if (selectedCount === 0) return "None selected";
    if (isDefault) return "Default filters";
    return `${selectedCount} filters`;
  }, [allSelected, selectedCount, isDefault]);

  const panel =
    open && mounted && portalStyle
      ? createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label="Activity filters"
            style={portalStyle}
            className="flex flex-col overflow-hidden rounded-xl border border-[#d8dee6] bg-white shadow-[0_16px_48px_rgb(15_23_42/0.18)]"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#eef2f6] px-4 py-2.5">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-[#1e2a38]">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate = !allSelected && selectedCount > 0;
                    }
                  }}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="size-3.5 rounded border-[#94a3b8] text-[#0f766e] focus:ring-[#0f766e]"
                />
                Select All
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title="Reset to default"
                  onClick={resetDefault}
                  className="rounded-md p-1.5 text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#1e2a38]"
                >
                  <RotateCcw className="size-4" />
                </button>
                <span className="mx-1 h-4 w-px bg-[#e2e8f0]" />
                <button
                  type="button"
                  title="Close"
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1.5 text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#1e2a38]"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="grid gap-0 sm:grid-cols-2 lg:grid-cols-4">
                {ACTIVITY_FILTER_GROUPS.map((group) => {
                  const groupIds = group.items.map((i) => i.id);
                  const groupAll = groupIds.every((id) => selected.has(id));
                  const groupSome =
                    !groupAll && groupIds.some((id) => selected.has(id));
                  return (
                    <div
                      key={group.id}
                      className="border-b border-[#eef2f6] px-3 py-3 sm:border-b-0 sm:border-r sm:last:border-r-0"
                    >
                      <label className="mb-2 flex cursor-pointer items-center gap-2 border-b border-[#f1f5f9] pb-2 text-[12px] font-bold uppercase tracking-[0.06em] text-[#334155]">
                        <input
                          type="checkbox"
                          checked={groupAll}
                          ref={(el) => {
                            if (el) el.indeterminate = groupSome;
                          }}
                          onChange={() => toggleGroup(group)}
                          className="size-3.5 rounded border-[#94a3b8] text-[#0f766e] focus:ring-[#0f766e]"
                        />
                        {group.label}
                      </label>
                      <ul className="space-y-1">
                        {group.items.map((item) => {
                          const on = selected.has(item.id);
                          const count = counts?.[item.id] ?? 0;
                          return (
                            <li key={item.id}>
                              <label
                                className={cn(
                                  "flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[12.5px] transition",
                                  on
                                    ? "bg-[#f0fdfa] font-medium text-[#134e4a]"
                                    : "text-[#475569] hover:bg-[#f8fafc]",
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() => toggleItem(item.id)}
                                  className="size-3.5 rounded border-[#94a3b8] text-[#0f766e] focus:ring-[#0f766e]"
                                />
                                <span className="min-w-0 flex-1 leading-snug">
                                  {item.label}
                                </span>
                                {count > 0 ? (
                                  <span className="tabular-nums text-[10px] font-semibold text-[#94a3b8]">
                                    {count}
                                  </span>
                                ) : null}
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition",
          open
            ? "bg-[#0f766e] text-white"
            : "bg-[#f0fdfa] text-[#0f766e] ring-1 ring-[#99f6e4] hover:bg-[#ccfbf1]",
        )}
      >
        <Filter className="size-3.5" />
        Filters
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
            open ? "bg-white/20" : "bg-white text-[#0f766e]",
          )}
        >
          {summary}
        </span>
      </button>
      {panel}
    </>
  );
}
