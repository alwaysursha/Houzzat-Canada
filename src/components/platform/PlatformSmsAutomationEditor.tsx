"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

type Version = {
  id: string;
  versionNumber: number;
  status: string;
  body: string;
  publishedAt: string | null;
  publishedByOperatorId: string | null;
  createdAt: string;
  rollbackOfVersionId: string | null;
};

export type SmsAutomationEditorModel = {
  key: string;
  name: string;
  recipient: string;
  triggerKey: string;
  description: string | null;
  active: boolean;
  replyEnabled: boolean;
  delayEditable: boolean;
  delayMinutes: number | null;
  inactivityDays: number | null;
  inactivityBuckets: number[] | null;
  allowedVariables: string[];
  createdAt: string;
  updatedAt: string;
  publishedVersion: Version | null;
  draftVersion: Version | null;
  versions: Version[];
};

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-700 bg-[#0f172a] px-3 py-2 text-sm text-slate-100";

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function PlatformSmsAutomationEditor({
  automation,
  protectionCopy,
}: {
  automation: SmsAutomationEditorModel;
  protectionCopy: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(automation.name);
  const [body, setBody] = useState(
    automation.draftVersion?.body ?? automation.publishedVersion?.body ?? "",
  );
  const [active, setActive] = useState(automation.active);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewValid, setPreviewValid] = useState<boolean | null>(null);
  const [previewIssues, setPreviewIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const liveVersion = automation.publishedVersion;

  async function parse(response: Response) {
    return (await response.json()) as ApiEnvelope<Record<string, unknown>>;
  }

  async function saveDraft() {
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/platform/v1/sms-automations/${encodeURIComponent(automation.key)}`,
        {
          method: "PATCH",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ body, name }),
        },
      );
      const payload = await parse(response);
      if (!response.ok || !payload.ok) {
        setError(payload.ok === false ? payload.message : "Unable to save draft.");
        return;
      }
      setNotice("Draft saved. Production still uses the last published version.");
      router.refresh();
    } catch {
      setError("Unable to save draft.");
    } finally {
      setBusy(null);
    }
  }

  async function runPreview() {
    setBusy("preview");
    setError(null);
    try {
      const response = await fetch(
        `/api/platform/v1/sms-automations/${encodeURIComponent(automation.key)}/preview`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ body }),
        },
      );
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

  async function publish() {
    setBusy("publish");
    setError(null);
    setNotice(null);
    try {
      const save = await fetch(
        `/api/platform/v1/sms-automations/${encodeURIComponent(automation.key)}`,
        {
          method: "PATCH",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ body, name }),
        },
      );
      const saved = await parse(save);
      if (!save.ok || !saved.ok) {
        setError(saved.ok === false ? saved.message : "Unable to save before publish.");
        return;
      }
      const response = await fetch(
        `/api/platform/v1/sms-automations/${encodeURIComponent(automation.key)}/publish`,
        { method: "POST", headers: { Accept: "application/json" } },
      );
      const payload = await parse(response);
      if (!response.ok || !payload.ok) {
        setError(payload.ok === false ? payload.message : "Unable to publish.");
        return;
      }
      setNotice("Published. All tenant workspaces will use this version.");
      router.refresh();
    } catch {
      setError("Unable to publish.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive() {
    setBusy("active");
    setError(null);
    try {
      const next = !active;
      const response = await fetch(
        `/api/platform/v1/sms-automations/${encodeURIComponent(automation.key)}`,
        {
          method: "PATCH",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ active: next }),
        },
      );
      const payload = await parse(response);
      if (!response.ok || !payload.ok) {
        setError(payload.ok === false ? payload.message : "Unable to update status.");
        return;
      }
      setActive(next);
      setNotice(next ? "Automation is active." : "Automation is inactive. Production will not send it.");
      router.refresh();
    } catch {
      setError("Unable to update status.");
    } finally {
      setBusy(null);
    }
  }

  async function rollback(versionId: string) {
    setBusy(`rollback:${versionId}`);
    setError(null);
    try {
      const response = await fetch(
        `/api/platform/v1/sms-automations/${encodeURIComponent(automation.key)}/rollback`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ versionId }),
        },
      );
      const payload = await parse(response);
      if (!response.ok || !payload.ok) {
        setError(payload.ok === false ? payload.message : "Unable to roll back.");
        return;
      }
      setNotice("Rolled back. A new published version was created from the selected history row.");
      router.refresh();
    } catch {
      setError("Unable to roll back.");
    } finally {
      setBusy(null);
    }
  }

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

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void toggleActive()}
          disabled={busy !== null}
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          {active ? "Deactivate" : "Activate"}
        </button>
        <p className="text-xs text-slate-500">
          Live published version:{" "}
          {liveVersion ? `v${liveVersion.versionNumber}` : "none"}
        </p>
      </div>

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
          SMS template
        </span>
        <textarea
          className={`${inputClass} min-h-36 font-mono text-[13px]`}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </label>
      <p className="text-xs text-slate-500">
        Allowed variables:{" "}
        {automation.allowedVariables.map((name) => `{{${name}}}`).join(" ")}
      </p>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void saveDraft()}
          disabled={busy !== null}
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          {busy === "save" ? "Saving…" : "Save draft"}
        </button>
        <button
          type="button"
          onClick={() => void runPreview()}
          disabled={busy !== null}
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          {busy === "preview" ? "Previewing…" : "Preview"}
        </button>
        <button
          type="button"
          onClick={() => void publish()}
          disabled={busy !== null}
          className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          {busy === "publish" ? "Publishing…" : "Publish"}
        </button>
      </div>

      {preview != null ? (
        <div className="rounded-xl border border-slate-800 bg-[#0f172a] p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Preview {previewValid ? "(valid)" : "(cannot publish until valid)"}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-100">{preview}</p>
          {previewIssues.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-300">
              {previewIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-200">Version history</h3>
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="min-w-full divide-y divide-slate-800 text-sm">
            <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Published</th>
                <th className="px-4 py-3">By</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {automation.versions.map((row) => {
                const isLive =
                  row.status === "PUBLISHED" &&
                  liveVersion?.id === row.id;
                return (
                  <tr key={row.id}>
                    <td className="px-4 py-3 text-slate-200">
                      v{row.versionNumber}
                      {row.rollbackOfVersionId ? (
                        <span className="ml-2 text-xs text-slate-500">rollback</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {row.status}
                      {isLive ? " · live" : ""}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {formatWhen(row.publishedAt)}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {row.publishedByOperatorId
                        ? `${row.publishedByOperatorId.slice(0, 8)}…`
                        : row.status === "PUBLISHED"
                          ? "system"
                          : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.status === "PUBLISHED" && !isLive ? (
                        <button
                          type="button"
                          onClick={() => void rollback(row.id)}
                          disabled={busy !== null}
                          className="text-xs text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                        >
                          {busy === `rollback:${row.id}` ? "Rolling back…" : "Roll back"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
