"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

export type SmsQuickTextEditorModel = {
  id: string;
  key: string;
  name: string;
  category: string;
  body: string;
  active: boolean;
  allowedVariables: string[];
};

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-700 bg-[#0f172a] px-3 py-2 text-sm text-slate-100";

export function PlatformSmsQuickTextEditor({
  item,
  protectionCopy,
  create,
}: {
  item: SmsQuickTextEditorModel | null;
  protectionCopy: string;
  create?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [active, setActive] = useState(item?.active ?? true);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewValid, setPreviewValid] = useState<boolean | null>(null);
  const [previewIssues, setPreviewIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function parse(response: Response) {
    return (await response.json()) as ApiEnvelope<Record<string, unknown>>;
  }

  async function save() {
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        create
          ? "/api/platform/v1/sms-quick-texts"
          : `/api/platform/v1/sms-quick-texts/${encodeURIComponent(item!.id)}`,
        {
          method: create ? "POST" : "PATCH",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name, category, body, active }),
        },
      );
      const payload = await parse(response);
      if (!response.ok || !payload.ok) {
        setError(payload.ok === false ? payload.message : "Unable to save.");
        return;
      }
      setNotice("Saved. Agents across every tenant will see the active copy.");
      if (create) {
        router.push("/platform/sms-quick-texts");
        router.refresh();
        return;
      }
      router.refresh();
    } catch {
      setError("Unable to save.");
    } finally {
      setBusy(null);
    }
  }

  async function runPreview() {
    setBusy("preview");
    setError(null);
    try {
      const path = item
        ? `/api/platform/v1/sms-quick-texts/${encodeURIComponent(item.id)}/preview`
        : "/api/platform/v1/sms-quick-texts";
      if (!item) {
        const local = body.trim();
        if (!local) {
          setError("Add a message body to preview.");
          return;
        }
      }
      const response = await fetch(path, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body }),
      });
      const payload = await parse(response);
      if (!response.ok || !payload.ok) {
        setError(payload.ok === false ? payload.message : "Unable to preview.");
        return;
      }
      const data = payload.data;
      setPreview(typeof data.rendered === "string" ? data.rendered : "");
      setPreviewValid(data.valid === true);
      const issues = Array.isArray(data.issues)
        ? data.issues.map((issue) => {
            if (!issue || typeof issue !== "object") return "Invalid variable";
            const row = issue as { placeholder?: string; reason?: string };
            return row.placeholder
              ? `{{${row.placeholder}}} (${row.reason})`
              : row.reason ?? "Invalid variable";
          })
        : [];
      setPreviewIssues(issues);
    } catch {
      setError("Unable to preview.");
    } finally {
      setBusy(null);
    }
  }

  const variables = item?.allowedVariables ?? [
    "firstName",
    "leadName",
    "agentName",
    "workspaceName",
    "propertyAddress",
  ];

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-slate-800 bg-[#0f172a] px-4 py-3 text-sm text-slate-400">
        {protectionCopy}
      </p>
      {error ? (
        <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-emerald-900/60 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </p>
      ) : null}

      <label className="block">
        <span className="text-xs uppercase tracking-wide text-slate-500">Name</span>
        <input
          className={inputClass}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="block">
        <span className="text-xs uppercase tracking-wide text-slate-500">
          Category
        </span>
        <input
          className={inputClass}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        />
      </label>
      <label className="block">
        <span className="text-xs uppercase tracking-wide text-slate-500">
          SMS body
        </span>
        <textarea
          className={`${inputClass} min-h-36 font-mono text-[13px]`}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </label>
      <p className="text-xs text-slate-500">
        Allowed variables: {variables.map((name) => `{{${name}}}`).join(" ")}
      </p>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
        />
        Active (visible to Agents)
      </label>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy !== null}
          className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          {busy === "save" ? "Saving…" : create ? "Create" : "Save"}
        </button>
        {item ? (
          <button
            type="button"
            onClick={() => void runPreview()}
            disabled={busy !== null}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            {busy === "preview" ? "Previewing…" : "Preview"}
          </button>
        ) : null}
      </div>
      {preview != null ? (
        <div className="rounded-xl border border-slate-800 bg-[#0f172a] p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Preview {previewValid ? "(valid)" : "(cannot save until valid)"}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-100">
            {preview}
          </p>
          {previewIssues.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-300">
              {previewIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
