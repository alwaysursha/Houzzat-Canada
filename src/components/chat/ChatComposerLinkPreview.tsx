"use client";

import { ExternalLink, Link2, X } from "lucide-react";
import type { ChatComposerLinkPreview as Preview } from "@/lib/chat/link-preview";
import { chatExternalLinkProps } from "@/lib/chat/link-preview";
import { cn } from "@/lib/utils";

export function ChatComposerLinkPreviewCard({
  preview,
  onDismiss,
  className,
}: {
  preview: Preview;
  onDismiss?: () => void;
  className?: string;
}) {
  const linkProps = chatExternalLinkProps(preview.href);
  return (
    <div
      className={cn(
        "flex items-stretch gap-2 overflow-hidden rounded-xl border border-[#d7e8df] bg-[#f7fbf9]",
        className,
      )}
    >
      <div
        className={cn(
          "flex w-1 shrink-0",
          preview.kind === "listing" ? "bg-[#0f6b4c]" : "bg-[#64748b]",
        )}
        aria-hidden
      />
      <a
        {...linkProps}
        className="min-w-0 flex-1 px-3 py-2 text-left hover:bg-white/60"
      >
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#5b7a6c]">
          {preview.kind === "listing" ? (
            <Link2 className="size-3" aria-hidden />
          ) : (
            <ExternalLink className="size-3" aria-hidden />
          )}
          {preview.hostname}
        </p>
        <p className="mt-0.5 truncate text-[13px] font-semibold text-[#12241c]">
          {preview.title}
        </p>
        {preview.description ? (
          <p className="mt-0.5 line-clamp-2 text-[12px] text-[#5b7a6c]">
            {preview.description}
          </p>
        ) : null}
      </a>
      {onDismiss ? (
        <button
          type="button"
          aria-label="Remove link preview"
          onClick={onDismiss}
          className="shrink-0 self-start px-2 py-2 text-[#7a9a8b] hover:text-[#1a2e24]"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/** Compact in-transcript link card (no server OG fetch). */
export function ChatMessageLinkCard({
  preview,
}: {
  preview: Preview;
}) {
  return (
    <ChatComposerLinkPreviewCard preview={preview} className="mb-1.5" />
  );
}
