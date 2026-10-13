"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2, Send } from "lucide-react";
import {
  canSendRecordedVoiceNote,
  createVoiceMediaRecorder,
  formatVoiceDurationMs,
  mapMicrophonePermissionError,
  probeVoiceRecordingSupport,
  revokeObjectUrl,
  stopMediaStream,
} from "@/lib/chat/voice-notes/recording-client";
import { VOICE_NOTE_MAX_DURATION_MS } from "@/lib/chat/voice-notes/constants";
import { chatHaptic } from "@/lib/chat/chat-haptics";
import { cn } from "@/lib/utils";

export type ChatVoiceDraft = {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  previewUrl: string;
};

export type ChatVoiceRecorderPhase = "idle" | "recording" | "preview";

export function ChatVoiceRecorder({
  disabled = false,
  sending = false,
  onSend,
  onPhaseChange,
  tone = "customer",
}: {
  disabled?: boolean;
  sending?: boolean;
  onSend: (draft: ChatVoiceDraft) => Promise<boolean>;
  onPhaseChange?: (phase: ChatVoiceRecorderPhase) => void;
  tone?: "customer" | "agent";
}) {
  const [phase, setPhaseState] = useState<ChatVoiceRecorderPhase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ChatVoiceDraft | null>(null);

  function setPhase(next: ChatVoiceRecorderPhase) {
    setPhaseState(next);
    onPhaseChange?.(next);
  }
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const mimeRef = useRef<string>("audio/webm");
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearInterval(timerRef.current);
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.onstop = () => undefined;
          recorder.stop();
        } catch {
          // ignore
        }
      }
      mediaRecorderRef.current = null;
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      revokeObjectUrl(previewUrlRef.current);
      previewUrlRef.current = null;
    };
  }, []);

  function clearTimer() {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function discardDraft() {
    revokeObjectUrl(previewUrlRef.current);
    previewUrlRef.current = null;
    setDraft(null);
    setPhase("idle");
    setElapsedMs(0);
  }

  async function startRecording() {
    setError(null);
    const support = probeVoiceRecordingSupport({
      hasMediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
      hasMediaRecorder: typeof MediaRecorder !== "undefined",
      isSecureContext: window.isSecureContext,
    });
    if (!support.ok) {
      setError(support.message);
      return;
    }
    chatHaptic("voice-start");
    try {
      // Permission prompt only after this explicit tap.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;
      const { recorder, mimeType } = createVoiceMediaRecorder(
        stream,
        (value) => MediaRecorder.isTypeSupported(value),
        MediaRecorder,
      );
      mimeRef.current = mimeType;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        clearTimer();
        stopMediaStream(streamRef.current);
        streamRef.current = null;
        const durationMs = Math.max(0, Date.now() - startedAtRef.current);
        const blobType =
          mimeRef.current ||
          chunksRef.current[0]?.type ||
          "audio/webm";
        mimeRef.current = blobType;
        const blob = new Blob(chunksRef.current, { type: blobType });
        chunksRef.current = [];
        revokeObjectUrl(previewUrlRef.current);
        const previewUrl = URL.createObjectURL(blob);
        previewUrlRef.current = previewUrl;
        setDraft({
          blob,
          mimeType: blobType,
          durationMs,
          previewUrl,
        });
        setPhase("preview");
        setElapsedMs(durationMs);
      };
      mediaRecorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setPhase("recording");
      recorder.start(250);
      timerRef.current = window.setInterval(() => {
        const next = Date.now() - startedAtRef.current;
        setElapsedMs(next);
        if (next >= VOICE_NOTE_MAX_DURATION_MS) {
          stopRecording();
        }
      }, 200);
    } catch (err) {
      stopMediaStream(streamRef.current);
      streamRef.current = null;
      const mapped = mapMicrophonePermissionError(err);
      setError(mapped.message);
      setPhase("idle");
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    chatHaptic("voice-stop");
    recorder.stop();
    mediaRecorderRef.current = null;
  }

  function cancelRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = () => undefined;
      recorder.stop();
    }
    mediaRecorderRef.current = null;
    clearTimer();
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    chunksRef.current = [];
    setPhase("idle");
    setElapsedMs(0);
  }

  async function sendDraft() {
    if (!draft) return;
    if (
      !canSendRecordedVoiceNote({
        durationMs: draft.durationMs,
        byteSize: draft.blob.size,
        sending,
      })
    ) {
      return;
    }
    const ok = await onSend(draft);
    if (ok) discardDraft();
  }

  const accent =
    tone === "agent"
      ? "text-canopy-deep hover:bg-canopy/10"
      : "text-canopy-deep hover:bg-canopy/10";
  const primaryBtn =
    "bg-[#0f6b4c] hover:bg-[#0c5740]";

  if (phase === "recording") {
    return (
      <div className="flex w-full items-center gap-2 rounded-xl border border-[#d7e8df] bg-white px-2 py-1.5">
        <span className="inline-flex size-2 animate-pulse rounded-full bg-signal" />
        <p className="min-w-0 flex-1 text-sm font-semibold tabular-nums text-ink">
          {formatVoiceDurationMs(elapsedMs)}
        </p>
        <button
          type="button"
          onClick={cancelRecording}
          aria-label="Cancel recording"
          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-ink/50 hover:bg-mist"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={stopRecording}
          aria-label="Stop recording"
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-lg",
            accent,
          )}
        >
          <Square className="size-3.5 fill-current" aria-hidden />
        </button>
      </div>
    );
  }

  if (phase === "preview" && draft) {
    return (
      <div className="w-full space-y-1.5 rounded-xl border border-[#d7e8df] bg-white px-2 py-1.5">
        <audio
          src={draft.previewUrl}
          controls
          preload="metadata"
          className="h-9 w-full"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold tabular-nums text-ink/55">
            {formatVoiceDurationMs(draft.durationMs)}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={sending}
              onClick={discardDraft}
              aria-label="Discard voice note"
              className="inline-flex size-8 items-center justify-center rounded-lg text-ink/45 hover:bg-mist disabled:opacity-50"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              disabled={
                sending ||
                !canSendRecordedVoiceNote({
                  durationMs: draft.durationMs,
                  byteSize: draft.blob.size,
                  sending,
                })
              }
              onClick={() => void sendDraft()}
              aria-label="Send voice note"
              className={cn(
                "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50",
                primaryBtn,
              )}
            >
              <Send className="size-3.5" aria-hidden />
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
        {error ? (
          <p className="text-[11px] leading-snug text-signal" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  // Idle: keep errors in normal flow ABOVE the mic so they are never clipped
  // by the chat pane overflow / mobile bottom nav (absolute-below was truncated).
  return (
    <div className="flex flex-col items-end gap-1">
      {error ? (
        <p
          className="max-w-[min(18rem,calc(100vw-3rem))] rounded-lg border border-signal/25 bg-white px-2.5 py-1.5 text-left text-[11px] leading-snug text-signal shadow-sm"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={disabled || sending}
        aria-label="Record voice note"
        onClick={() => void startRecording()}
        className={cn(
          "inline-flex size-10 items-center justify-center rounded-full text-white shadow-sm disabled:opacity-50",
          primaryBtn,
        )}
      >
        <Mic className="size-4" aria-hidden />
      </button>
    </div>
  );
}
