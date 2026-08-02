"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pin } from "lucide-react";
import { cn } from "@/lib/utils";

export function LeadNoteForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<"GENERAL" | "CALL">("GENERAL");
  const [pinned, setPinned] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setPending(true);
    try {
      const res = await fetch("/api/agent/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId,
          body: body.trim(),
          category,
          pinned,
        }),
      });
      if (res.ok) {
        setBody("");
        setPinned(false);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="inline-flex rounded-md border border-line bg-mist/40 p-0.5"
          role="group"
          aria-label="Note category"
        >
          {(
            [
              ["GENERAL", "General"],
              ["CALL", "Call"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setCategory(value)}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] font-semibold transition",
                category === value
                  ? "bg-white text-ink shadow-sm"
                  : "text-ink/55 hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setPinned((v) => !v)}
          aria-pressed={pinned}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition",
            pinned
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-line bg-white text-ink/55 hover:text-ink",
          )}
        >
          <Pin className={cn("size-3.5", pinned && "fill-amber-500")} />
          {pinned ? "Pinned" : "Pin"}
        </button>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder={
          category === "CALL"
            ? "Call outcome, next steps…"
            : "Follow-up notes, preferences…"
        }
        className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm"
        required
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        Save note
      </button>
    </form>
  );
}
