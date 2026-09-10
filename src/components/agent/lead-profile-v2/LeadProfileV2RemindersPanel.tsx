"use client";

import { useState, type ReactNode } from "react";
import { Pin } from "lucide-react";
import { TaskForm } from "@/components/agent/TaskForm";
import type { LeadProfileV2TasksPanel } from "@/lib/agent/lead-profile-v2/types";
import { cn } from "@/lib/utils";

export function LeadProfileV2RemindersPanel({
  leadId,
  panel,
  loading,
  error,
  onTaskCreated,
  onNotePinned,
}: {
  leadId: string;
  panel: LeadProfileV2TasksPanel | null;
  loading: boolean;
  error: boolean;
  onTaskCreated: () => void;
  onNotePinned: () => void;
}) {
  const [pinPendingId, setPinPendingId] = useState<string | null>(null);

  async function toggleNotePin(noteId: string, pinned: boolean) {
    if (pinPendingId) return;
    setPinPendingId(noteId);
    try {
      const res = await fetch("/api/agent/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId, pinned }),
      });
      if (!res.ok) return;
      onNotePinned();
    } finally {
      setPinPendingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Panel title="Set reminder">
        <TaskForm leadId={leadId} compact onUpdated={onTaskCreated} />
      </Panel>
      {loading ? (
        <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
          Loading…
        </p>
      ) : error ? (
        <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
          Failed to load
        </p>
      ) : (panel?.tasks.length ?? 0) === 0 ? (
        <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
          No reminders yet.
        </p>
      ) : (
        (panel?.tasks ?? []).map((task) => (
          <div
            key={task.id}
            className="rounded-lg border border-[#e2e8f0] bg-white px-4 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[14px] font-semibold text-[#1e2a38]">
                {task.title}
              </p>
              <span
                className={cn(
                  "rounded px-2 py-0.5 text-[10px] font-bold uppercase",
                  task.status === "OPEN"
                    ? "bg-amber-100 text-amber-900"
                    : "bg-slate-100 text-slate-600",
                )}
              >
                {task.status}
              </span>
            </div>
            <p className="mt-1 text-[12px] text-[#64748b]">
              {task.type} · due {new Date(task.dueAt).toLocaleString("en-CA")}
            </p>
          </div>
        ))
      )}
      {panel && panel.notes.length > 0 ? (
        <Panel title="Follow-up notes">
          <ul className="space-y-2">
            {panel.notes.map((n) => (
              <li
                key={n.id}
                className={cn(
                  "rounded-md border px-3 py-2 text-[13px]",
                  n.pinned
                    ? "border-amber-200 bg-amber-50/70"
                    : "border-[#eef2f6] bg-[#f8fafc]",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] text-[#94a3b8]">
                    <span
                      className={cn(
                        "mr-1.5 inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        n.category === "CALL"
                          ? "bg-[#e0f2fe] text-[#0369a1]"
                          : "bg-[#e2e8f0] text-[#475569]",
                      )}
                    >
                      {n.category === "CALL" ? "Call" : "General"}
                    </span>
                    {n.author.name || n.author.email} ·{" "}
                    {new Date(n.createdAt).toLocaleString("en-CA")}
                  </p>
                  <button
                    type="button"
                    disabled={pinPendingId === n.id}
                    onClick={() => void toggleNotePin(n.id, !n.pinned)}
                    title={
                      n.pinned
                        ? "Unpin from activity top"
                        : "Pin to top of activity"
                    }
                    className={cn(
                      "inline-flex size-7 shrink-0 items-center justify-center rounded-md transition disabled:opacity-50",
                      n.pinned
                        ? "bg-amber-100 text-amber-800"
                        : "text-[#94a3b8] hover:bg-white hover:text-[#1e2a38]",
                    )}
                  >
                    <Pin
                      className={cn("size-3.5", n.pinned && "fill-amber-500")}
                    />
                  </button>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-[#334155]">
                  {n.body}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
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
