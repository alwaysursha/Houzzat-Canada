"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TaskForm({
  leadId,
  compact = false,
  onUpdated,
}: {
  leadId?: string;
  compact?: boolean;
  onUpdated?: () => void;
}) {
  const router = useRouter();
  const [type, setType] = useState<"CALL" | "EMAIL" | "TODO">("CALL");
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 2);
    d.setMinutes(0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setPending(true);
    try {
      const res = await fetch("/api/agent/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          type,
          title: title.trim(),
          dueAt: new Date(dueAt).toISOString(),
        }),
      });
      if (res.ok) {
        setTitle("");
        router.refresh();
        onUpdated?.();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className={
        compact
          ? "flex flex-wrap items-end gap-2"
          : "space-y-3 rounded-2xl border border-line bg-surface p-4"
      }
    >
      {!compact ? (
        <h3 className="text-sm font-semibold text-ink">Set reminder</h3>
      ) : null}
      <select
        value={type}
        onChange={(e) => setType(e.target.value as typeof type)}
        className="rounded-lg border border-line px-2 py-1.5 text-xs"
      >
        <option value="CALL">Call</option>
        <option value="EMAIL">Email</option>
        <option value="TODO">To-do</option>
      </select>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Follow up…"
        className="min-w-[160px] flex-1 rounded-lg border border-line px-2 py-1.5 text-xs"
        required
      />
      <input
        type="datetime-local"
        value={dueAt}
        onChange={(e) => setDueAt(e.target.value)}
        className="rounded-lg border border-line px-2 py-1.5 text-xs"
        required
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-canopy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        Add
      </button>
    </form>
  );
}

export function TaskCompleteButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await fetch("/api/agent/tasks", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ taskId, status: "DONE" }),
          });
          router.refresh();
        } finally {
          setPending(false);
        }
      }}
      className="rounded-md px-2 py-1 text-[11px] font-semibold text-canopy hover:bg-canopy/10 disabled:opacity-50"
    >
      Done
    </button>
  );
}
