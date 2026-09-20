"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ExclusionReason = {
  reason: string;
  count: number;
  label: string;
};

type MassSmsPreview = {
  selectedCount: number;
  eligibleCount: number;
  excludedCount: number;
  exclusionReasons: ExclusionReason[];
  composerSegments: number;
  estimatedTotalSegments: number;
  remainingSegments: number | null;
  allowancePermitted: boolean;
  allowanceReason: string | null;
  batchLimit: number;
  overLimit: boolean;
  bodyValid: boolean;
  bodyIssues: Array<{ placeholder: string; reason: string }>;
  quickTexts: Array<{
    id: string;
    key: string;
    name: string;
    category: string;
    body: string;
  }>;
  maxBodyLength: number;
};

type MassSmsBatch = {
  id: string;
  status: string;
  requestedCount: number;
  eligibleCount: number;
  excludedCount: number;
  successfulCount: number;
  failedCount: number;
  estimatedSegments: number;
  actualSegments: number;
  remainingSegments: number | null;
  allowanceReason: string | null;
  confirmationPrompt: string | null;
};

export function MassSmsForm({ leadIds }: { leadIds: string[] }) {
  const router = useRouter();
  const clientKeyRef = useRef(crypto.randomUUID());
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<MassSmsPreview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [batch, setBatch] = useState<MassSmsBatch | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (leadIds.length === 0) return;
    const handle = window.setTimeout(() => {
      void (async () => {
        const res = await fetch("/api/agent/leads/sms-mass/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadIds, body }),
        });
        const json = (await res.json().catch(() => null)) as {
          preview?: MassSmsPreview;
        } | null;
        if (json?.preview) setPreview(json.preview);
      })();
    }, 250);
    return () => window.clearTimeout(handle);
  }, [leadIds, body]);

  useEffect(() => {
    if (!batch?.id) return;
    if (batch.status !== "PENDING" && batch.status !== "RUNNING") return;
    const handle = window.setInterval(() => {
      void (async () => {
        const res = await fetch(`/api/agent/leads/sms-mass/${batch.id}`);
        const json = (await res.json().catch(() => null)) as {
          batch?: MassSmsBatch;
        } | null;
        if (json?.batch) setBatch(json.batch);
      })();
    }, 1000);
    return () => window.clearInterval(handle);
  }, [batch?.id, batch?.status]);

  if (leadIds.length === 0) return null;

  async function sendConfirmed() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/leads/sms-mass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientKey: clientKeyRef.current,
          leadIds,
          body,
          confirm: true,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        batch?: MassSmsBatch;
        error?: string;
      } | null;
      if (!res.ok || !json?.batch) {
        setError(json?.error || "Could not send SMS");
        return;
      }
      setBatch(json.batch);
      setConfirming(false);
      if (json.batch.status === "COMPLETE" || json.batch.status === "BLOCKED") {
        clientKeyRef.current = crypto.randomUUID();
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const eligible = preview?.eligibleCount ?? 0;
  const estimated = preview?.estimatedTotalSegments ?? 0;
  const batchLimit = preview?.batchLimit ?? 100;
  const canReview =
    !pending &&
    Boolean(preview?.bodyValid) &&
    !preview?.overLimit &&
    eligible > 0 &&
    Boolean(preview?.allowancePermitted);

  return (
    <div className="space-y-2 rounded-2xl border border-canopy/25 bg-canopy/5 p-4">
      <h3 className="text-sm font-semibold text-ink">
        Send SMS ({leadIds.length} / {batchLimit} selected)
      </h3>
      <p className="text-xs text-ink/60">
        Eligible {preview?.eligibleCount ?? "…"} · Excluded{" "}
        {preview?.excludedCount ?? "…"} · Selected {leadIds.length} / {batchLimit}
      </p>
      {preview?.exclusionReasons?.length ? (
        <ul className="text-xs text-ink/55">
          {preview.exclusionReasons.map((row) => (
            <li key={row.reason}>
              {row.label}: {row.count}
            </li>
          ))}
        </ul>
      ) : null}

      {preview?.quickTexts?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {preview.quickTexts.map((quickText) => (
            <button
              key={quickText.id}
              type="button"
              onClick={() => {
                setBody(quickText.body);
                setConfirming(false);
              }}
              disabled={pending}
              className="rounded-full border border-[#d8dee6] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#475569] hover:bg-[#eef6ff] disabled:opacity-50"
            >
              {quickText.name}
            </button>
          ))}
        </div>
      ) : null}

      <textarea
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setConfirming(false);
        }}
        rows={4}
        maxLength={preview?.maxBodyLength ?? 1600}
        placeholder="Write an SMS. Use {{firstName}}, {{leadName}}, {{agentName}}, {{workspaceName}}."
        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
      />

      <p className="text-xs text-ink/55">
        This message: {preview?.composerSegments ?? 0} segment
        {(preview?.composerSegments ?? 0) === 1 ? "" : "s"} · Estimated total:{" "}
        {estimated} · Remaining allowance:{" "}
        {preview?.remainingSegments ?? "unavailable"}
      </p>
      {preview?.overLimit ? (
        <p className="text-xs font-semibold text-red-700">
          Too many leads selected ({leadIds.length} / {batchLimit}).
        </p>
      ) : null}
      {!preview?.bodyValid && body.trim() ? (
        <p className="text-xs font-semibold text-red-700">
          This message uses a variable that Mass SMS cannot fill.
        </p>
      ) : null}
      {preview && !preview.allowancePermitted && eligible > 0 ? (
        <p className="text-xs font-semibold text-red-700">
          Workspace SMS allowance is insufficient for this send.
        </p>
      ) : null}

      {confirming ? (
        <div className="space-y-2 rounded-lg border border-canopy/30 bg-white p-3">
          <p className="text-sm font-semibold text-ink">
            Send to {eligible} eligible lead{eligible === 1 ? "" : "s"} using
            approximately {estimated} SMS segment{estimated === 1 ? "" : "s"}?
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => void sendConfirmed()}
              className="rounded-lg bg-canopy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Sending…" : "Confirm send"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-50"
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={!canReview}
          onClick={() => setConfirming(true)}
          className="rounded-lg bg-canopy px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Review send
        </button>
      )}

      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      {batch ? (
        <p className="text-xs text-ink/55">
          {batch.status === "BLOCKED"
            ? "Send blocked: insufficient SMS allowance."
            : `Successful ${batch.successfulCount} · Failed ${batch.failedCount} · Excluded ${batch.excludedCount} · Segments ${batch.actualSegments || batch.estimatedSegments}`}
        </p>
      ) : null}
    </div>
  );
}
