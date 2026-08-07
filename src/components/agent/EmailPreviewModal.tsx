"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Eye, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type EmailPreviewPayload = {
  id: string;
  subject: string;
  body: string;
  htmlBody: string | null;
  toEmail: string;
  kind: string | null;
  mlsNumber: string | null;
  openedAt: string | null;
  openCount: number;
  clickedAt: string | null;
  clickCount: number;
  lastClickedUrl: string | null;
  createdAt: string;
  leadId: string;
  customerName: string | null;
  sentByName: string | null;
};

export function EmailPreviewModal({
  emailId,
  onClose,
}: {
  emailId: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<EmailPreviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!emailId) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    fetch(`/api/agent/emails/${emailId}`)
      .then(async (res) => {
        const json = (await res.json()) as EmailPreviewPayload & {
          error?: string;
        };
        if (!res.ok) throw new Error(json.error || "Failed to load email");
        if (!cancelled) setData(json);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [emailId]);

  useEffect(() => {
    if (!emailId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [emailId, onClose]);

  if (!emailId) return null;

  const html = data?.htmlBody?.trim() || null;
  const kindLabel = data?.kind
    ? data.kind.replaceAll("_", " ")
    : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close preview"
        className="absolute inset-0 bg-[#0f172a]/55 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Email preview"
        className="relative z-10 flex max-h-[min(92vh,960px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-[#e2e8f0] bg-white shadow-[0_24px_80px_rgb(15_23_42/0.28)] sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#eef2f6] bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-[#ecfeff] px-2 py-0.5 text-[11px] font-semibold text-[#0e7490]">
                <Eye className="size-3" />
                Client preview
              </span>
              {kindLabel ? (
                <span className="rounded-md bg-[#f1f5f9] px-2 py-0.5 text-[11px] font-semibold capitalize text-[#475569]">
                  {kindLabel}
                </span>
              ) : null}
            </div>
            <h2 className="mt-1.5 truncate text-[16px] font-bold text-[#0f172a]">
              {data?.subject ?? (loading ? "Loading…" : "Email")}
            </h2>
            {data ? (
              <>
                <p className="mt-0.5 text-[12px] text-[#64748b]">
                  To {data.toEmail}
                  {data.customerName ? ` · ${data.customerName}` : ""}
                  {" · "}
                  {new Date(data.createdAt).toLocaleString("en-CA")}
                  {data.sentByName
                    ? ` · by ${data.sentByName}`
                    : " · automated"}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {data.openedAt ? (
                    <span className="rounded-md bg-[#d1fae5] px-2 py-0.5 text-[11px] font-bold text-[#047857] ring-1 ring-[#6ee7b7]">
                      Opened
                      {data.openCount > 1 ? ` · ${data.openCount}×` : ""}
                    </span>
                  ) : (
                    <span className="rounded-md bg-[#f1f5f9] px-2 py-0.5 text-[11px] font-semibold text-[#94a3b8]">
                      Not opened yet
                    </span>
                  )}
                  {data.clickedAt ? (
                    <span className="rounded-md bg-[#fef3c7] px-2 py-0.5 text-[11px] font-bold text-[#b45309] ring-1 ring-[#fcd34d]">
                      Clicked
                      {data.clickCount > 1 ? ` · ${data.clickCount}×` : ""}
                    </span>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Link
              href={`/agent/emails/${emailId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-[#0e7490] hover:bg-[#ecfeff]"
            >
              <ExternalLink className="size-3.5" />
              Full page
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a]"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden bg-[#f1f5f9]">
          {loading ? (
            <div className="flex h-[min(70vh,720px)] items-center justify-center gap-2 text-sm text-[#64748b]">
              <Loader2 className="size-4 animate-spin" />
              Loading what the client received…
            </div>
          ) : error ? (
            <div className="flex h-[min(40vh,320px)] items-center justify-center px-6 text-center text-sm text-[#b91c1c]">
              {error}
            </div>
          ) : html ? (
            <iframe
              title="Email preview"
              srcDoc={html}
              className="h-[min(70vh,720px)] w-full border-0 bg-white"
              sandbox="allow-same-origin"
            />
          ) : (
            <pre
              className={cn(
                "h-[min(70vh,720px)] overflow-auto whitespace-pre-wrap p-6 text-sm text-[#334155]",
              )}
            >
              {data?.body ?? ""}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

export function emailLogIdFromTimelineItem(item: {
  id: string;
  emailPreviewPath?: string | null;
}): string | null {
  if (item.emailPreviewPath?.startsWith("/agent/emails/")) {
    return item.emailPreviewPath.slice("/agent/emails/".length) || null;
  }
  if (item.id.startsWith("email-")) return item.id.slice("email-".length);
  return null;
}
