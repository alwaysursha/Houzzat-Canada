"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Pin } from "lucide-react";
import {
  V2_NOTE_CREATE_ENDPOINT,
  V2_NOTE_SUCCESS_MESSAGE_MS,
  shouldSkipV2NoteSubmit,
  v2NoteComposerCanSubmit,
  v2NoteComposerFailureMessage,
  v2NoteComposerPlaceholder,
  v2NoteComposerSuccessMessage,
  v2NoteCreatePayload,
  type V2NoteCategory,
} from "@/lib/agent/lead-profile-v2/note-composer-query";
import { cn } from "@/lib/utils";

export function LeadProfileV2NoteComposer({
  leadId,
  onCreated,
}: {
  leadId: string;
  onCreated: () => void;
}) {
  const [noteBody, setNoteBody] = useState("");
  const [noteCategory, setNoteCategory] = useState<V2NoteCategory>("GENERAL");
  const [notePinned, setNotePinned] = useState(false);
  const [notePending, setNotePending] = useState(false);
  const [noteMessage, setNoteMessage] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const messageTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (messageTimerRef.current != null) {
        window.clearTimeout(messageTimerRef.current);
      }
    };
  }, []);

  function clearMessageTimer() {
    if (messageTimerRef.current != null) {
      window.clearTimeout(messageTimerRef.current);
      messageTimerRef.current = null;
    }
  }

  async function submitNote(e: FormEvent) {
    e.preventDefault();
    if (
      shouldSkipV2NoteSubmit({
        body: noteBody,
        inFlight: inFlightRef.current,
      })
    ) {
      return;
    }
    inFlightRef.current = true;
    setNotePending(true);
    setNoteMessage(null);
    clearMessageTimer();
    const payload = v2NoteCreatePayload({
      leadId,
      body: noteBody,
      category: noteCategory,
      pinned: notePinned,
    });
    try {
      const res = await fetch(V2_NOTE_CREATE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error || "Could not save note");
      }
      setNoteBody("");
      setNotePinned(false);
      setNoteMessage(
        v2NoteComposerSuccessMessage({
          category: noteCategory,
          pinned: notePinned,
        }),
      );
      onCreated();
      messageTimerRef.current = window.setTimeout(() => {
        setNoteMessage(null);
        messageTimerRef.current = null;
      }, V2_NOTE_SUCCESS_MESSAGE_MS);
    } catch (err) {
      setNoteMessage(v2NoteComposerFailureMessage(err));
    } finally {
      inFlightRef.current = false;
      setNotePending(false);
    }
  }

  return (
    <form
      onSubmit={submitNote}
      className="shrink-0 border-b border-[#e8edf2] bg-white px-4 py-2.5"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div
          className="inline-flex rounded-md border border-[#d8dee6] bg-[#f8fafc] p-0.5"
          role="group"
          aria-label="Note category"
        >
          {(
            [
              ["GENERAL", "General"],
              ["CALL", "Call"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setNoteCategory(value)}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] font-semibold transition",
                noteCategory === value
                  ? "bg-white text-[#1e2a38] shadow-sm"
                  : "text-[#64748b] hover:text-[#1e2a38]",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setNotePinned((v) => !v)}
          aria-pressed={notePinned}
          title={notePinned ? "Unpin note" : "Pin note to top of activity"}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition",
            notePinned
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-[#d8dee6] bg-white text-[#64748b] hover:bg-[#f8fafc] hover:text-[#1e2a38]",
          )}
        >
          <Pin
            className={cn(
              "size-3.5",
              notePinned && "fill-amber-500 text-amber-700",
            )}
          />
          {notePinned ? "Pinned" : "Pin"}
        </button>
      </div>
      <div className="flex gap-2">
        <input
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
          placeholder={v2NoteComposerPlaceholder(noteCategory)}
          className="min-w-0 flex-1 rounded-md border border-[#d8dee6] bg-white px-3 py-2 text-[13px] text-[#1e2a38] outline-none placeholder:text-[#94a3b8] focus:border-[#2b6cb0]"
        />
        <button
          type="submit"
          disabled={!v2NoteComposerCanSubmit({ body: noteBody, pending: notePending })}
          className="shrink-0 rounded-md bg-[#1e2a38] px-3 py-2 text-[12px] font-bold text-white disabled:opacity-40"
        >
          {notePending ? "…" : "Save"}
        </button>
      </div>
      {noteMessage ? (
        <p className="mt-1.5 text-[11px] font-medium text-[#64748b]">
          {noteMessage}
        </p>
      ) : null}
    </form>
  );
}
