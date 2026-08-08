"use client";

import { useMemo, useState } from "react";
import { Download, Trash2, Upload } from "lucide-react";
import {
  draftsFromMappedRows,
  LEAD_IMPORT_FIELD_OPTIONS,
  parseLeadsCsvTable,
  suggestLeadImportMapping,
  validateImportDraft,
  type LeadImportColumnMapping,
  type LeadImportDraft,
  type LeadImportField,
} from "@/lib/agent/parse-leads-csv";
import { cn } from "@/lib/utils";

type Step = "upload" | "review" | "done";

type ImportResult = {
  createdCount: number;
  skippedCount: number;
  failedCount: number;
  parseErrorCount: number;
  skipped: Array<{ row: number; email: string; reason: string }>;
  failed: Array<{ row: number; email: string; error: string }>;
  parseErrors: Array<{ row: number; error: string }>;
};

const MAX_ROWS = 500;

export function LeadImportModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<LeadImportColumnMapping[]>([]);
  const [drafts, setDrafts] = useState<LeadImportDraft[]>([]);
  const [allowDupes, setAllowDupes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const stats = useMemo(() => {
    let ready = 0;
    let issues = 0;
    let skipped = 0;
    const emails = new Map<string, number>();
    for (const draft of drafts) {
      if (!draft.included) {
        skipped += 1;
        continue;
      }
      const problems = validateImportDraft(draft);
      const email = draft.email.trim().toLowerCase();
      if (email) {
        emails.set(email, (emails.get(email) ?? 0) + 1);
      }
      if (problems.length) issues += 1;
      else ready += 1;
    }
    let dupeIssues = 0;
    for (const draft of drafts) {
      if (!draft.included) continue;
      const email = draft.email.trim().toLowerCase();
      if (email && (emails.get(email) ?? 0) > 1) dupeIssues += 1;
    }
    return { ready, issues, skipped, dupeIssues };
  }, [drafts]);

  function reset() {
    setStep("upload");
    setFileName(null);
    setRawRows([]);
    setMapping([]);
    setDrafts([]);
    setAllowDupes(false);
    setError(null);
    setPending(false);
    setResult(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function onFileChange(file: File | null) {
    setError(null);
    setResult(null);
    if (!file) return;
    const text = await file.text();
    const { headers, rows } = parseLeadsCsvTable(text);
    if (!headers.length) {
      setError("Could not read any columns from that CSV.");
      return;
    }
    if (rows.length === 0) {
      setError("CSV has headers but no data rows.");
      return;
    }
    if (rows.length > MAX_ROWS) {
      setError(`Too many rows (max ${MAX_ROWS}).`);
      return;
    }
    const nextMapping = suggestLeadImportMapping(headers);
    const hasName = nextMapping.some((m) => m.field === "name");
    const hasEmail = nextMapping.some((m) => m.field === "email");
    setFileName(file.name);
    setRawRows(rows);
    setMapping(nextMapping);
    setDrafts(draftsFromMappedRows(rows, nextMapping));
    setStep("review");
    if (!hasName || !hasEmail) {
      setError(
        "Couldn’t auto-detect name and email. Use the column mapping below to fix it.",
      );
    }
  }

  function updateMapping(header: string, field: LeadImportField) {
    setMapping((prev) => {
      const next = prev.map((col) => {
        if (col.header !== header) {
          // Only one column per field
          if (field !== "skip" && col.field === field) {
            return { ...col, field: "skip" as const };
          }
          return col;
        }
        return { ...col, field };
      });
      setDrafts(draftsFromMappedRows(rawRows, next));
      return next;
    });
    setError(null);
  }

  function updateDraft(
    key: string,
    patch: Partial<Pick<LeadImportDraft, "name" | "email" | "phone" | "notes" | "included">>,
  ) {
    setDrafts((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function removeDraft(key: string) {
    setDrafts((prev) => prev.filter((row) => row.key !== key));
  }

  async function importLeads() {
    setError(null);
    const emailCounts = new Map<string, number>();
    for (const draft of drafts) {
      if (!draft.included) continue;
      const email = draft.email.trim().toLowerCase();
      if (email) emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
    }

    const leads = drafts
      .filter((d) => d.included)
      .filter((d) => validateImportDraft(d).length === 0)
      .filter((d) => (emailCounts.get(d.email.trim().toLowerCase()) ?? 0) === 1)
      .map((d) => ({
        name: d.name.trim(),
        email: d.email.trim().toLowerCase(),
        phone: d.phone.trim() || undefined,
        notes: d.notes.trim() || undefined,
        row: d.row,
      }));

    if (leads.length === 0) {
      setError("No valid rows ready to import. Fix highlighted issues first.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/agent/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leads,
          allowDuplicates: allowDupes,
        }),
      });
      const json = (await res.json()) as ImportResult & { error?: string };
      if (!res.ok) {
        setError(json.error || "Import failed");
        if (json.parseErrors?.length) {
          setResult({
            createdCount: 0,
            skippedCount: 0,
            failedCount: 0,
            parseErrorCount: json.parseErrors.length,
            skipped: [],
            failed: [],
            parseErrors: json.parseErrors,
          });
        }
        return;
      }
      setResult({
        createdCount: json.createdCount ?? 0,
        skippedCount: json.skippedCount ?? 0,
        failedCount: json.failedCount ?? 0,
        parseErrorCount: json.parseErrorCount ?? 0,
        skipped: json.skipped ?? [],
        failed: json.failed ?? [],
        parseErrors: json.parseErrors ?? [],
      });
      setStep("done");
      if ((json.createdCount ?? 0) > 0) onImported();
    } finally {
      setPending(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-[#1e2a38]/45"
        aria-label="Close"
        onClick={handleClose}
      />
      <div className="relative z-10 flex max-h-[min(92dvh,880px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[#d8dee6] bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-[#e2e8f0] px-4 py-3 sm:px-5">
          <div>
            <h3 className="text-[16px] font-bold text-[#1e2a38]">
              Import Leads (CSV)
            </h3>
            <p className="mt-0.5 text-[12px] text-[#64748b]">
              {step === "upload"
                ? "Upload a CSV — we’ll map columns automatically."
                : step === "review"
                  ? "Review and fix anything before importing."
                  : "Import finished."}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md px-2 py-1 text-[12px] font-semibold text-[#64748b] hover:bg-[#f8fafc]"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {step === "upload" ? (
            <div className="space-y-4">
              <p className="text-[13px] leading-relaxed text-[#475569]">
                Required fields after mapping:{" "}
                <span className="font-semibold text-[#334155]">name</span> and{" "}
                <span className="font-semibold text-[#334155]">email</span>.
                Phone and notes are optional. Max {MAX_ROWS} rows. Imported leads
                are assigned to you as New Lead.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href="/api/agent/leads/import"
                  className="inline-flex items-center gap-1.5 rounded border border-[#d8dee6] px-2.5 py-1.5 text-[11px] font-semibold text-[#475569] hover:bg-[#f8fafc]"
                >
                  <Download className="size-3.5" />
                  Download template
                </a>
              </div>
              <label
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-4 py-10 text-center transition hover:border-[#94a3b8] hover:bg-[#f1f5f9]"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const file = e.dataTransfer.files?.[0] ?? null;
                  void onFileChange(file);
                }}
              >
                <Upload className="size-6 text-[#64748b]" />
                <span className="text-[13px] font-semibold text-[#334155]">
                  Choose CSV file
                </span>
                <span className="text-[11px] text-[#94a3b8]">
                  or drag and drop into this area
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(e) => {
                    void onFileChange(e.target.files?.[0] ?? null);
                  }}
                />
              </label>
              {error ? (
                <p className="text-xs text-[#e11d48]">{error}</p>
              ) : null}
            </div>
          ) : null}

          {step === "review" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12px] text-[#64748b]">
                  File:{" "}
                  <span className="font-semibold text-[#334155]">
                    {fileName}
                  </span>{" "}
                  · {drafts.length} rows ·{" "}
                  <span className="text-[#059669]">{stats.ready} ready</span>
                  {stats.issues ? (
                    <>
                      {" "}
                      ·{" "}
                      <span className="text-[#b45309]">
                        {stats.issues} need fixes
                      </span>
                    </>
                  ) : null}
                  {stats.dupeIssues ? (
                    <>
                      {" "}
                      ·{" "}
                      <span className="text-[#b45309]">
                        {stats.dupeIssues} duplicate emails
                      </span>
                    </>
                  ) : null}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    reset();
                  }}
                  className="text-[11px] font-semibold text-[#2b6cb0] hover:underline"
                >
                  Choose another file
                </button>
              </div>

              <div className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#64748b]">
                  Column mapping
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {mapping.map((col) => (
                    <label
                      key={col.header}
                      className="flex items-center gap-2 rounded-md bg-white px-2.5 py-2 text-[12px] ring-1 ring-[#e2e8f0]"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium text-[#334155]">
                        {col.header}
                      </span>
                      <select
                        value={col.field}
                        onChange={(e) =>
                          updateMapping(
                            col.header,
                            e.target.value as LeadImportField,
                          )
                        }
                        className="rounded border border-[#d8dee6] bg-white px-2 py-1 text-[12px] font-semibold text-[#0f172a]"
                      >
                        {LEAD_IMPORT_FIELD_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-[#e2e8f0]">
                <table className="min-w-full text-left text-[12px]">
                  <thead className="bg-[#f1f5f9] text-[10px] font-bold uppercase tracking-wide text-[#64748b]">
                    <tr>
                      <th className="px-2 py-2">Include</th>
                      <th className="px-2 py-2">Row</th>
                      <th className="px-2 py-2">Name</th>
                      <th className="px-2 py-2">Email</th>
                      <th className="px-2 py-2">Phone</th>
                      <th className="px-2 py-2">Notes</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map((draft) => {
                      const issues = draft.included
                        ? validateImportDraft(draft)
                        : [];
                      const email = draft.email.trim().toLowerCase();
                      const dupe =
                        draft.included &&
                        email &&
                        drafts.filter(
                          (d) =>
                            d.included &&
                            d.email.trim().toLowerCase() === email,
                        ).length > 1;
                      if (dupe) issues.push("Duplicate email in file");
                      const hasIssue = issues.length > 0;

                      return (
                        <tr
                          key={draft.key}
                          className={cn(
                            "border-t border-[#e2e8f0]",
                            !draft.included && "opacity-50",
                            hasIssue && draft.included && "bg-[#fff7ed]",
                          )}
                        >
                          <td className="px-2 py-1.5 align-top">
                            <input
                              type="checkbox"
                              checked={draft.included}
                              onChange={(e) =>
                                updateDraft(draft.key, {
                                  included: e.target.checked,
                                })
                              }
                            />
                          </td>
                          <td className="px-2 py-1.5 align-top tabular-nums text-[#94a3b8]">
                            {draft.row}
                          </td>
                          {(
                            [
                              ["name", draft.name],
                              ["email", draft.email],
                              ["phone", draft.phone],
                              ["notes", draft.notes],
                            ] as const
                          ).map(([field, value]) => (
                            <td key={field} className="px-2 py-1.5 align-top">
                              <input
                                value={value}
                                onChange={(e) =>
                                  updateDraft(draft.key, {
                                    [field]: e.target.value,
                                  })
                                }
                                className={cn(
                                  "w-full min-w-[7rem] rounded border px-1.5 py-1 text-[12px] text-[#0f172a]",
                                  hasIssue &&
                                    (field === "name" || field === "email")
                                    ? "border-[#fdba74] bg-white"
                                    : "border-[#e2e8f0] bg-white",
                                )}
                              />
                            </td>
                          ))}
                          <td className="px-2 py-1.5 align-top">
                            {!draft.included ? (
                              <span className="text-[#94a3b8]">Skipped</span>
                            ) : hasIssue ? (
                              <span className="font-medium text-[#c2410c]">
                                {issues[0]}
                              </span>
                            ) : (
                              <span className="font-medium text-[#059669]">
                                Ready
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 align-top">
                            <button
                              type="button"
                              onClick={() => removeDraft(draft.key)}
                              className="rounded p-1 text-[#94a3b8] hover:bg-[#fee2e2] hover:text-[#b91c1c]"
                              aria-label={`Remove row ${draft.row}`}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <label className="flex items-start gap-2 text-[12px] text-[#475569]">
                <input
                  type="checkbox"
                  checked={allowDupes}
                  onChange={(e) => setAllowDupes(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Allow duplicates (create even if an open lead already exists
                  for that email)
                </span>
              </label>

              {error ? (
                <p className="text-xs text-[#e11d48]">{error}</p>
              ) : null}
            </div>
          ) : null}

          {step === "done" && result ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-[13px] text-[#166534]">
                Created{" "}
                <span className="font-bold">{result.createdCount}</span> lead
                {result.createdCount === 1 ? "" : "s"}
                {result.skippedCount
                  ? ` · Skipped ${result.skippedCount}`
                  : ""}
                {result.failedCount ? ` · Failed ${result.failedCount}` : ""}
              </div>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 text-[11px] text-[#334155]">
                {[
                  ...result.parseErrors.map(
                    (r) => `Row ${r.row}: ${r.error}`,
                  ),
                  ...result.skipped.map(
                    (r) => `Row ${r.row} (${r.email}): ${r.reason}`,
                  ),
                  ...result.failed.map(
                    (r) => `Row ${r.row} (${r.email}): ${r.error}`,
                  ),
                ]
                  .slice(0, 60)
                  .map((line) => (
                    <p key={line} className="text-[#64748b]">
                      {line}
                    </p>
                  ))}
                {!result.skipped.length &&
                !result.failed.length &&
                !result.parseErrors.length ? (
                  <p className="text-[#64748b]">All selected rows imported.</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#e2e8f0] px-4 py-3 sm:px-5">
          {step === "review" ? (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-[#64748b]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending || stats.ready === 0}
                onClick={() => void importLeads()}
                className="rounded-md bg-[#5b9aaa] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {pending
                  ? "Importing…"
                  : `Import ${stats.ready} lead${stats.ready === 1 ? "" : "s"}`}
              </button>
            </>
          ) : null}
          {step === "done" ? (
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md bg-[#5b9aaa] px-3 py-1.5 text-xs font-semibold text-white"
            >
              Done
            </button>
          ) : null}
          {step === "upload" ? (
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-[#64748b]"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
