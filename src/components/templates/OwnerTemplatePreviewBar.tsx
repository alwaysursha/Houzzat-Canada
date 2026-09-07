"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getTemplate, parseThemeId } from "@/lib/tenancy/templates";

/**
 * Stage 6.11B.1 / 6.11E.2 — unmistakable OWNER preview chrome.
 * Exit clears cookie only. Use This Design saves via authorized persistence.
 * Non-selectable templates (Team Signature design review) hide Apply.
 */
export function OwnerTemplatePreviewBar({
  displayLabel,
  themeId,
}: {
  displayLabel: string;
  themeId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"exit" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const parsed = parseThemeId(themeId);
  const canApply =
    parsed != null && getTemplate(parsed.templateId)?.selectable === true;

  async function post(action: "exit" | "apply") {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/template-preview", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          action === "apply"
            ? { action: "apply", themeId }
            : { action: "exit" },
        ),
      });
      const body = (await res.json()) as {
        ok: boolean;
        message?: string;
        data?: { redirectTo?: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.message ?? "Unable to update preview.");
        return;
      }
      router.push(body.data?.redirectTo ?? "/");
      router.refresh();
    } catch {
      setError("Network error updating preview.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      role="status"
      data-owner-preview-bar="true"
      className="sticky top-0 z-[60] border-b border-amber-800/20 bg-amber-50 text-amber-950"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-10">
        <p className="text-sm font-medium">
          Previewing: <span className="font-semibold">{displayLabel}</span>
          <span className="ml-2 text-xs font-normal text-amber-900/70">
            {canApply
              ? "Unsaved — other visitors still see your live design"
              : "Design review only — cannot apply to this workspace yet"}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy != null}
            onClick={() => void post("exit")}
            className="rounded-md border border-amber-900/20 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-60"
          >
            {busy === "exit" ? "Exiting…" : "Exit Preview"}
          </button>
          {canApply ? (
            <button
              type="button"
              disabled={busy != null}
              onClick={() => void post("apply")}
              className="rounded-md bg-amber-900 px-3 py-1.5 text-xs font-semibold text-amber-50 hover:bg-amber-950 disabled:opacity-60"
            >
              {busy === "apply" ? "Saving…" : "Use This Design"}
            </button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p className="border-t border-amber-800/10 px-4 py-1.5 text-xs text-red-700 sm:px-6 lg:px-10">
          {error}
        </p>
      ) : null}
    </div>
  );
}
