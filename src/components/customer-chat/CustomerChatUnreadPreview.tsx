"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Send, X } from "lucide-react";
import { ChatAgentAvatar } from "@/components/chat/ChatAgentAvatar";
import { ChatVoiceRecorder } from "@/components/chat/ChatVoiceRecorder";
import { useCustomerChatController } from "@/components/customer-chat/CustomerChatProvider";
import { useCustomerChatThread } from "@/components/customer-chat/useCustomerChatThread";
import {
  chatComposerHasSendableText,
  chatComposerTrailingAction,
} from "@/lib/chat/composer-ui";
import {
  presentCustomerChatAgentInitials,
  presentCustomerChatAgentName,
  type CustomerChatUnreadPreviewState,
} from "@/lib/customer-chat/floating-chat";
import {
  customerChatComposerCanSubmit,
  customerChatComposerKeyAction,
} from "@/lib/customer-chat/query";
import { cn } from "@/lib/utils";

function formatPreviewTime(iso: string | null): string {
  if (!iso) return "";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  return new Date(at).toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CustomerChatUnreadPreview({
  preview,
}: {
  preview: CustomerChatUnreadPreviewState;
}) {
  const { draft, setDraft, expand, close, isMobile } =
    useCustomerChatController();
  const { send, sendVoiceNote, sending } = useCustomerChatThread({
    chatVisible: false,
    enabled: true,
  });
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const agentName = presentCustomerChatAgentName({
    name: preview.agentName,
    photoUrl: preview.agentPhotoUrl,
  });
  const initials = presentCustomerChatAgentInitials({
    name: preview.agentName,
    photoUrl: preview.agentPhotoUrl,
  });
  const trailing = chatComposerTrailingAction({ body: draft, voiceBusy });
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  async function submitText() {
    if (
      !customerChatComposerCanSubmit({
        body: draft,
        pending: sending,
        canSend: true,
      })
    ) {
      return;
    }
    setSendError(null);
    const ok = await send(draft);
    if (ok) {
      setDraft("");
      expand();
      return;
    }
    setSendError("Couldn’t send. Open the conversation to try again.");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    const action = customerChatComposerKeyAction({
      key: event.key,
      shiftKey: event.shiftKey,
    });
    if (action !== "send") return;
    event.preventDefault();
    void submitText();
  }

  return (
    <div
      role="dialog"
      aria-label={`${agentName} sent a message`}
      data-customer-chat-floating=""
      className={cn(
        "fixed z-[70] w-[min(22.5rem,calc(100vw-1.5rem))]",
        isMobile
          ? "bottom-[calc(var(--mobile-bottom-nav,0px)+1rem)] left-1/2 -translate-x-1/2"
          : "bottom-6 right-6",
        reduceMotion
          ? null
          : "animate-in fade-in slide-in-from-bottom-2 duration-300",
      )}
    >
      <div className="overflow-hidden rounded-2xl border border-[#d7e8df] bg-[#fbfefc] shadow-[0_18px_48px_rgba(15,61,46,0.18)]">
        <div className="flex items-start gap-3 border-b border-[#e6f2ec] bg-white px-3.5 py-3">
          <ChatAgentAvatar
            name={agentName}
            initials={initials}
            photoUrl={preview.agentPhotoUrl}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-5 text-[#12241c]">
              {agentName} sent a message
            </p>
            <p className="mt-0.5 text-[12px] font-medium text-[#3d6a57]">
              {preview.unreadCount > 1
                ? `${preview.unreadCount} unread`
                : "Unread"}
              {preview.messageCreatedAt
                ? ` · ${formatPreviewTime(preview.messageCreatedAt)}`
                : null}
            </p>
          </div>
          <button
            type="button"
            aria-label="Dismiss message preview"
            onClick={close}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[#3d6a57] hover:bg-[#eef8f3]"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="px-3.5 py-3">
          <p className="line-clamp-3 whitespace-pre-wrap break-words text-[15px] leading-6 text-[#1a2e24]">
            {preview.messagePreview || "New message"}
          </p>
        </div>

        <div className="space-y-2 border-t border-[#e6f2ec] bg-white px-3 py-2.5">
          {voiceBusy ? (
            <ChatVoiceRecorder
              disabled={sending}
              sending={sending}
              tone="customer"
              onPhaseChange={(phase) => setVoiceBusy(phase !== "idle")}
              onSend={async (voiceDraft) => {
                const ok = await sendVoiceNote({
                  blob: voiceDraft.blob,
                  mimeType: voiceDraft.mimeType,
                  durationMs: voiceDraft.durationMs,
                });
                if (ok) expand();
                return ok;
              }}
            />
          ) : (
            <div className="flex items-end gap-1.5 rounded-full border border-[#d7e8df] bg-[#f7fbf9] px-2 py-1.5">
              <label className="sr-only" htmlFor="customer-chat-preview-composer">
                Quick reply
              </label>
              <textarea
                id="customer-chat-preview-composer"
                ref={inputRef}
                value={draft}
                rows={1}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Reply…"
                enterKeyHint="send"
                className="max-h-24 min-h-[2.25rem] flex-1 resize-none bg-transparent px-2 py-1.5 text-[16px] leading-5 text-[#12241c] outline-none placeholder:text-[#7a9a8b]"
              />
              <div className="relative size-10 shrink-0">
                {trailing === "send" ? (
                  <button
                    type="button"
                    aria-label="Send reply"
                    disabled={
                      sending || !chatComposerHasSendableText(draft)
                    }
                    onClick={() => void submitText()}
                    className="inline-flex size-10 items-center justify-center rounded-full bg-[#0f6b4c] text-white disabled:opacity-50"
                  >
                    <Send className="size-4" aria-hidden />
                  </button>
                ) : (
                  <div className="flex size-10 items-center justify-center">
                    <ChatVoiceRecorder
                      disabled={sending}
                      sending={sending}
                      tone="customer"
                      onPhaseChange={(phase) => setVoiceBusy(phase !== "idle")}
                      onSend={async (voiceDraft) => {
                        const ok = await sendVoiceNote({
                          blob: voiceDraft.blob,
                          mimeType: voiceDraft.mimeType,
                          durationMs: voiceDraft.durationMs,
                        });
                        if (ok) expand();
                        return ok;
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
          {sendError ? (
            <p className="text-[12px] font-medium text-[#b45309]" role="alert">
              {sendError}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={expand}
              className="flex-1 rounded-xl bg-[#0f6b4c] px-3 py-2.5 text-[14px] font-semibold text-white hover:bg-[#0c5740]"
            >
              Open conversation
            </button>
            <button
              type="button"
              onClick={close}
              className="rounded-xl border border-[#d7e8df] bg-white px-3 py-2.5 text-[14px] font-semibold text-[#1a2e24] hover:bg-[#f7fbf9]"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
