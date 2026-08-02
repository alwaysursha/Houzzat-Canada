"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LeadNoteForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setPending(true);
    try {
      const res = await fetch("/api/agent/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, body: body.trim() }),
      });
      if (res.ok) {
        setBody("");
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Follow-up notes, call outcomes, preferences…"
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
