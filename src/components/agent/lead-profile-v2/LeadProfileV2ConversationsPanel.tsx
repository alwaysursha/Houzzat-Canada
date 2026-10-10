"use client";

import { useState, type ReactNode } from "react";
import { Eye } from "lucide-react";
import { EmailPreviewModal } from "@/components/agent/EmailPreviewModal";
import { LeadEmailForm } from "@/components/agent/LeadEmailForm";
import { LeadProfileV2ChatPane } from "@/components/agent/lead-profile-v2/LeadProfileV2ChatPane";
import type { V2ChatSurface } from "@/lib/agent/lead-profile-v2/chat-query";
import type {
  LeadProfileV2ChatPanel,
  LeadProfileV2EmailsPanel,
} from "@/lib/agent/lead-profile-v2/types";
import { cn } from "@/lib/utils";

export function LeadProfileV2ConversationsPanel({
  leadId,
  defaultTo,
  consented,
  surface,
  onSurfaceChange,
  panel,
  loading,
  error,
  onEmailSent,
  onLoadMore,
  chat,
}: {
  leadId: string;
  defaultTo: string | null;
  consented: boolean;
  surface: V2ChatSurface;
  onSurfaceChange: (surface: V2ChatSurface) => void;
  panel: LeadProfileV2EmailsPanel | null;
  loading: boolean;
  error: boolean;
  onEmailSent: () => void;
  onLoadMore: () => void;
  chat: {
    panel: LeadProfileV2ChatPanel | null;
    loading: boolean;
    error: boolean;
    busy: boolean;
    sending: boolean;
    sendError: string | null;
    onRetry: () => void;
    onLoadOlder: () => void;
    onSend: (
      body: string,
      channel?: "CHAT" | "SMS",
      options?: { replyToMessageId?: string | null },
    ) => Promise<boolean>;
    onReact?: (messageId: string, key: string) => Promise<boolean>;
    onSearch?: (
      query: string,
      cursor?: string | null,
    ) => Promise<{
      hits: Array<{
        id: string;
        body: string;
        senderName: string;
        createdAt: string;
      }>;
      page: { hasMore: boolean; nextCursor: string | null };
    }>;
    onEnsureMessage?: (messageId: string) => Promise<boolean>;
  };
}) {
  const [previewEmailId, setPreviewEmailId] = useState<string | null>(null);
  const [activeLeadId, setActiveLeadId] = useState(leadId);

  if (leadId !== activeLeadId) {
    setActiveLeadId(leadId);
    setPreviewEmailId(null);
  }

  return (
    <div
      className={cn(
        surface === "chat" ? "flex min-h-0 flex-1 flex-col gap-4" : "space-y-4",
      )}
    >
      <div
        role="tablist"
        aria-label="Conversations"
        className="flex w-fit rounded-lg border border-[#d8dee6] bg-[#f8fafc] p-0.5"
      >
        <SurfaceTab
          id="chat"
          label="Chat"
          selected={surface === "chat"}
          onSelect={() => onSurfaceChange("chat")}
        />
        <SurfaceTab
          id="email"
          label="Email"
          selected={surface === "email"}
          onSelect={() => onSurfaceChange("email")}
        />
      </div>

      {surface === "chat" ? (
        <div
          id="v2-conversations-chat-panel"
          role="tabpanel"
          aria-labelledby="v2-conversations-chat-tab"
          className="flex min-h-0 flex-1 flex-col"
        >
          <LeadProfileV2ChatPane
            panel={chat.panel}
            loading={chat.loading}
            error={chat.error}
            busy={chat.busy}
            sending={chat.sending}
            sendError={chat.sendError}
            onRetry={chat.onRetry}
            onLoadOlder={chat.onLoadOlder}
            onSend={chat.onSend}
            onReact={chat.onReact}
            onSearch={chat.onSearch}
            onEnsureMessage={chat.onEnsureMessage}
          />
        </div>
      ) : (
        <div id="v2-conversations-email-panel" role="tabpanel" aria-labelledby="v2-conversations-email-tab">
          <Panel title="Send email">
            <LeadEmailForm
              leadId={leadId}
              defaultTo={defaultTo}
              consented={consented}
              onUpdated={onEmailSent}
            />
          </Panel>
          {loading ? (
            <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
              Loading…
            </p>
          ) : error ? (
            <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
              Failed to load
            </p>
          ) : (panel?.emails.length ?? 0) === 0 ? (
            <p className="rounded-lg border border-dashed border-[#d8dee6] bg-white px-4 py-10 text-center text-sm text-[#94a3b8]">
              No emails logged yet.
            </p>
          ) : (
            (panel?.emails ?? []).map((e) => (
              <div
                key={e.id}
                className="rounded-lg border border-[#e2e8f0] bg-white px-4 py-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[14px] font-semibold text-[#1e2a38]">
                    {e.subject}
                  </p>
                  <time className="text-[11px] text-[#94a3b8]">
                    {new Date(e.createdAt).toLocaleString("en-CA")}
                  </time>
                </div>
                <p className="mt-0.5 text-[12px] text-[#64748b]">
                  To {e.toEmail}
                  {e.kind ? (
                    <span className="ml-1.5 capitalize text-[#94a3b8]">
                      · {e.kind.replaceAll("_", " ")}
                    </span>
                  ) : null}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {e.openedAt ? (
                    <span className="rounded-md bg-[#d1fae5] px-2 py-0.5 text-[11px] font-bold text-[#047857] ring-1 ring-[#6ee7b7]">
                      Opened
                      {e.openCount > 1 ? ` · ${e.openCount}×` : ""}
                    </span>
                  ) : (
                    <span className="rounded-md bg-[#f1f5f9] px-2 py-0.5 text-[11px] font-semibold text-[#94a3b8]">
                      Not opened yet
                    </span>
                  )}
                  {e.clickedAt ? (
                    <span className="rounded-md bg-[#fef3c7] px-2 py-0.5 text-[11px] font-bold text-[#b45309] ring-1 ring-[#fcd34d]">
                      Clicked
                      {e.clickCount > 1 ? ` · ${e.clickCount}×` : ""}
                    </span>
                  ) : null}
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setPreviewEmailId(e.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f172a] px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm transition hover:bg-[#1e293b]"
                  >
                    <Eye className="size-3.5" />
                    Preview
                  </button>
                </div>
              </div>
            ))
          )}
          {panel?.hasMore ? (
            <button
              type="button"
              onClick={onLoadMore}
              className="rounded-lg border border-[#d8dee6] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#1e2a38] hover:bg-[#f8fafc]"
            >
              Load more
            </button>
          ) : null}
          <EmailPreviewModal
            emailId={previewEmailId}
            onClose={() => setPreviewEmailId(null)}
          />
        </div>
      )}
    </div>
  );
}

function SurfaceTab({
  id,
  label,
  selected,
  onSelect,
}: {
  id: V2ChatSurface;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={`v2-conversations-${id}-tab`}
      aria-selected={selected}
      aria-controls={`v2-conversations-${id}-panel`}
      onClick={onSelect}
      className={cn(
        "rounded-md px-3 py-1.5 text-[12px] font-semibold",
        selected
          ? "bg-white text-[#1e2a38] shadow-sm"
          : "text-[#64748b] hover:text-[#1e2a38]",
      )}
    >
      {label}
    </button>
  );
}

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-[#e2e8f0] bg-white px-4 py-3",
        className,
      )}
    >
      <h3 className="mb-3 text-[13px] font-bold text-[#1e2a38]">{title}</h3>
      {children}
    </section>
  );
}
