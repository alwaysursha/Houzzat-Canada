"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Bookmark, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  AGENT_QUICK_REPLY_BODY_MAX,
  AGENT_QUICK_REPLY_NAME_MAX,
  createAgentQuickReply,
  deleteAgentQuickReply,
  fetchAgentQuickReplies,
  filterAgentQuickReplies,
  previewQuickReplyBody,
  updateAgentQuickReply,
  type AgentQuickReply,
} from "@/lib/chat/quick-replies/client";
import { cn } from "@/lib/utils";

type PanelMode =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "edit"; reply: AgentQuickReply }
  | { kind: "delete"; reply: AgentQuickReply };

export function ChatQuickReplyPicker({
  onInsert,
  disabled = false,
  align = "left",
}: {
  /** Returns false when insert is rejected (e.g. length limit). Never sends. */
  onInsert: (body: string) => boolean;
  disabled?: boolean;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [replies, setReplies] = useState<AgentQuickReply[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<PanelMode>({ kind: "list" });
  const [formName, setFormName] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formPending, setFormPending] = useState(false);
  const [insertError, setInsertError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (mode.kind !== "list") {
          setMode({ kind: "list" });
          setFormError(null);
          return;
        }
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, mode.kind]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void fetchAgentQuickReplies().then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setLoadError(result.error);
        return;
      }
      setReplies(result.replies);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = useMemo(
    () => filterAgentQuickReplies(replies, query),
    [query, replies],
  );

  function resetForm() {
    setFormName("");
    setFormBody("");
    setFormError(null);
    setFormPending(false);
  }

  function openCreate() {
    resetForm();
    setInsertError(null);
    setMode({ kind: "create" });
  }

  function openEdit(reply: AgentQuickReply) {
    setFormName(reply.name);
    setFormBody(reply.body);
    setFormError(null);
    setFormPending(false);
    setInsertError(null);
    setMode({ kind: "edit", reply });
  }

  function backToList() {
    setMode({ kind: "list" });
    resetForm();
  }

  async function submitForm() {
    const name = formName.trim();
    const body = formBody.trim();
    if (!name || name.length > AGENT_QUICK_REPLY_NAME_MAX) {
      setFormError(`Name is required (max ${AGENT_QUICK_REPLY_NAME_MAX}).`);
      return;
    }
    if (!body || body.length > AGENT_QUICK_REPLY_BODY_MAX) {
      setFormError(`Body is required (max ${AGENT_QUICK_REPLY_BODY_MAX}).`);
      return;
    }
    setFormPending(true);
    setFormError(null);
    if (mode.kind === "create") {
      const result = await createAgentQuickReply({ name, body });
      setFormPending(false);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setReplies((prev) => [...prev, result.reply]);
      backToList();
      return;
    }
    if (mode.kind === "edit") {
      const result = await updateAgentQuickReply({
        id: mode.reply.id,
        name,
        body,
      });
      setFormPending(false);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setReplies((prev) =>
        prev.map((row) => (row.id === result.reply.id ? result.reply : row)),
      );
      backToList();
    }
  }

  async function confirmDelete() {
    if (mode.kind !== "delete") return;
    setFormPending(true);
    setFormError(null);
    const result = await deleteAgentQuickReply(mode.reply.id);
    setFormPending(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setReplies((prev) => prev.filter((row) => row.id !== mode.reply.id));
    backToList();
  }

  function handleInsert(reply: AgentQuickReply) {
    setInsertError(null);
    const ok = onInsert(reply.body);
    if (!ok) {
      setInsertError("Message is too long to insert this reply.");
      return;
    }
    setOpen(false);
    setQuery("");
    setMode({ kind: "list" });
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-label="My Quick Replies"
        aria-expanded={open}
        aria-controls={panelId}
        title="My Quick Replies"
        onClick={() => {
          setOpen((value) => !value);
          setInsertError(null);
          if (open) {
            setMode({ kind: "list" });
            setQuery("");
          }
        }}
        className="inline-flex size-8 items-center justify-center rounded-lg text-[#64748b] hover:bg-[#eef2f7] hover:text-[#1e2a38] disabled:opacity-50"
      >
        <Bookmark className="size-4" aria-hidden />
      </button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="My Quick Replies"
          className={cn(
            "absolute bottom-[calc(100%+0.4rem)] z-30 flex max-h-[min(24rem,70vh)] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-[#d8dee6] bg-white shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-[#e2e8f0] px-3 py-2">
            <p className="text-[12px] font-semibold text-[#1e2a38]">
              My Quick Replies
            </p>
            {mode.kind === "list" ? (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-[#2b6cb0] hover:bg-[#eef6ff]"
              >
                <Plus className="size-3.5" aria-hidden />
                New
              </button>
            ) : (
              <button
                type="button"
                onClick={backToList}
                className="rounded-md px-1.5 py-1 text-[11px] font-semibold text-[#64748b] hover:bg-[#f1f5f9]"
              >
                Back
              </button>
            )}
          </div>

          {mode.kind === "list" ? (
            <>
              <div className="border-b border-[#e2e8f0] p-2">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search replies"
                  aria-label="Search quick replies"
                  className="w-full rounded-lg border border-[#d8dee6] bg-[#f8fafc] px-2.5 py-1.5 text-sm text-[#1e2a38] outline-none ring-[#2b6cb0]/40 focus:ring-2"
                />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 px-3 py-8 text-[12px] text-[#64748b]">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Loading…
                  </div>
                ) : loadError ? (
                  <div className="space-y-2 px-3 py-6 text-center">
                    <p className="text-[12px] text-rose-600">{loadError}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setLoading(true);
                        setLoadError(null);
                        void fetchAgentQuickReplies().then((result) => {
                          setLoading(false);
                          if (!result.ok) {
                            setLoadError(result.error);
                            return;
                          }
                          setReplies(result.replies);
                        });
                      }}
                      className="text-[12px] font-semibold text-[#2b6cb0] hover:underline"
                    >
                      Retry
                    </button>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="px-3 py-8 text-center text-[12px] text-[#64748b]">
                    {replies.length === 0
                      ? "No saved replies yet. Create one for faster chat replies."
                      : "No replies match your search."}
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {filtered.map((reply) => (
                      <li key={reply.id}>
                        <div className="group flex items-stretch gap-0.5 rounded-lg hover:bg-[#f8fafc]">
                          <button
                            type="button"
                            onClick={() => handleInsert(reply)}
                            className="min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left"
                          >
                            <p className="truncate text-[12px] font-semibold text-[#1e2a38]">
                              {reply.name}
                            </p>
                            <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[#64748b]">
                              {previewQuickReplyBody(reply.body)}
                            </p>
                          </button>
                          <div className="flex shrink-0 flex-col justify-center gap-0.5 pr-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                            <button
                              type="button"
                              aria-label={`Edit ${reply.name}`}
                              onClick={() => openEdit(reply)}
                              className="inline-flex size-7 items-center justify-center rounded-md text-[#64748b] hover:bg-white hover:text-[#1e2a38]"
                            >
                              <Pencil className="size-3.5" aria-hidden />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${reply.name}`}
                              onClick={() => {
                                setFormError(null);
                                setMode({ kind: "delete", reply });
                              }}
                              className="inline-flex size-7 items-center justify-center rounded-md text-[#64748b] hover:bg-white hover:text-rose-600"
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {insertError ? (
                <p
                  className="border-t border-[#e2e8f0] px-3 py-2 text-[11px] font-medium text-rose-600"
                  role="status"
                >
                  {insertError}
                </p>
              ) : null}
            </>
          ) : null}

          {mode.kind === "create" || mode.kind === "edit" ? (
            <div className="space-y-2 overflow-y-auto p-3">
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-[#64748b]">
                  Name
                </span>
                <input
                  value={formName}
                  maxLength={AGENT_QUICK_REPLY_NAME_MAX}
                  onChange={(event) => setFormName(event.target.value)}
                  className="w-full rounded-lg border border-[#d8dee6] px-2.5 py-1.5 text-sm outline-none ring-[#2b6cb0]/40 focus:ring-2"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-[#64748b]">
                  Message
                </span>
                <textarea
                  value={formBody}
                  maxLength={AGENT_QUICK_REPLY_BODY_MAX}
                  rows={5}
                  onChange={(event) => setFormBody(event.target.value)}
                  className="w-full resize-none rounded-lg border border-[#d8dee6] px-2.5 py-1.5 text-sm outline-none ring-[#2b6cb0]/40 focus:ring-2"
                />
              </label>
              {formError ? (
                <p className="text-[11px] font-medium text-rose-600" role="status">
                  {formError}
                </p>
              ) : null}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={formPending}
                  onClick={backToList}
                  className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-[#64748b] hover:bg-[#f1f5f9] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={formPending}
                  onClick={() => void submitForm()}
                  className="rounded-lg bg-[#2b6cb0] px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#245a94] disabled:opacity-50"
                >
                  {formPending ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : null}

          {mode.kind === "delete" ? (
            <div className="space-y-3 p-3">
              <p className="text-[13px] text-[#1e2a38]">
                Delete{" "}
                <span className="font-semibold">{mode.reply.name}</span>? This
                cannot be undone.
              </p>
              {formError ? (
                <p className="text-[11px] font-medium text-rose-600" role="status">
                  {formError}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={formPending}
                  onClick={backToList}
                  className="rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-[#64748b] hover:bg-[#f1f5f9] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={formPending}
                  onClick={() => void confirmDelete()}
                  className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {formPending ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
