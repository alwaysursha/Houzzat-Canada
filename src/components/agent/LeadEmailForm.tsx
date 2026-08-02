"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LeadEmailForm({
  leadId,
  defaultTo,
  consented,
  onUpdated,
}: {
  leadId: string;
  defaultTo?: string | null;
  consented: boolean;
  onUpdated?: () => void;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState("Following up on your home search");
  const [body, setBody] = useState(
    "Hi,\n\nJust checking in on the homes you were viewing. Happy to set up a showing or refine your alerts.\n\n— Houzzat",
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/agent/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "single",
          leadId,
          subject,
          body,
        }),
      });
      const json = (await res.json()) as {
        sent?: number;
        skipped?: number;
        errors?: string[];
      };
      if (res.ok) {
        setMessage(
          json.sent
            ? "Email sent and logged."
            : json.errors?.[0] || "Skipped (consent or email).",
        );
        router.refresh();
        onUpdated?.();
      } else {
        setMessage("Send failed.");
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">Email lead</h3>
        <span className="text-[11px] text-ink/45">
          {defaultTo || "No email"} · {consented ? "CASL ok" : "No consent"}
        </span>
      </div>
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="w-full rounded-lg border border-line px-3 py-2 text-sm"
        required
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        className="w-full rounded-lg border border-line px-3 py-2 text-sm"
        required
      />
      <button
        type="submit"
        disabled={pending || !consented || !defaultTo}
        className="rounded-lg bg-canopy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        Send email
      </button>
      {message ? <p className="text-xs text-ink/55">{message}</p> : null}
    </form>
  );
}

export function MassEmailForm({ leadIds }: { leadIds: string[] }) {
  const router = useRouter();
  const [subject, setSubject] = useState("New listings you may like");
  const [body, setBody] = useState(
    "Hi,\n\nA few homes matched your criteria this week. Reply if you'd like private showings.\n\n— Houzzat",
  );
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  if (leadIds.length === 0) return null;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setResult(null);
        try {
          const res = await fetch("/api/agent/email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "mass",
              leadIds,
              subject,
              body,
            }),
          });
          const json = (await res.json()) as {
            sent?: number;
            skipped?: number;
          };
          setResult(`Sent ${json.sent ?? 0} · skipped ${json.skipped ?? 0}`);
          router.refresh();
        } finally {
          setPending(false);
        }
      }}
      className="space-y-2 rounded-2xl border border-canopy/25 bg-canopy/5 p-4"
    >
      <h3 className="text-sm font-semibold text-ink">
        Mass email ({leadIds.length} selected)
      </h3>
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
        required
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
        required
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-canopy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        Send to selected
      </button>
      {result ? <p className="text-xs text-ink/55">{result}</p> : null}
    </form>
  );
}
