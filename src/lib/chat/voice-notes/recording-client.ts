/**
 * Client-safe voice recording helpers (no Prisma / no Node FS).
 */

import {
  VOICE_NOTE_MAX_DURATION_MS,
  VOICE_NOTE_MIN_DURATION_MS,
} from "@/lib/chat/voice-notes/constants";

export type VoiceRecordingSupport =
  | { ok: true }
  | {
      ok: false;
      reason: "UNSUPPORTED" | "INSECURE_CONTEXT" | "NO_MEDIA_DEVICES";
      message: string;
    };

export type VoicePermissionFailure = {
  reason: "DENIED" | "DISMISSED" | "UNAVAILABLE";
  message: string;
};

export function probeVoiceRecordingSupport(input: {
  hasMediaDevices: boolean;
  hasMediaRecorder: boolean;
  isSecureContext: boolean;
}): VoiceRecordingSupport {
  if (!input.isSecureContext) {
    return {
      ok: false,
      reason: "INSECURE_CONTEXT",
      message: "Voice notes require a secure (HTTPS) connection.",
    };
  }
  if (!input.hasMediaDevices) {
    return {
      ok: false,
      reason: "NO_MEDIA_DEVICES",
      message: "This browser can’t access a microphone.",
    };
  }
  if (!input.hasMediaRecorder) {
    return {
      ok: false,
      reason: "UNSUPPORTED",
      message: "Voice recording isn’t supported in this browser.",
    };
  }
  return { ok: true };
}

export function mapMicrophonePermissionError(error: unknown): VoicePermissionFailure {
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name?: unknown }).name)
      : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return {
      reason: "DENIED",
      message: "Microphone access was denied. Enable it in your browser settings.",
    };
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return {
      reason: "UNAVAILABLE",
      message: "No microphone was found on this device.",
    };
  }
  if (name === "AbortError") {
    return {
      reason: "DISMISSED",
      message: "Microphone permission was dismissed.",
    };
  }
  return {
    reason: "UNAVAILABLE",
    message: "Couldn’t start the microphone. Please try again.",
  };
}

export function preferredMediaRecorderMimeType(
  isTypeSupported: (mime: string) => boolean,
): string | undefined {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const mime of candidates) {
    if (isTypeSupported(mime)) return mime;
  }
  return undefined;
}

export function formatVoiceDurationMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function canSendRecordedVoiceNote(input: {
  durationMs: number;
  byteSize: number;
  sending: boolean;
}): boolean {
  if (input.sending) return false;
  if (input.byteSize <= 0) return false;
  if (input.durationMs < VOICE_NOTE_MIN_DURATION_MS) return false;
  if (input.durationMs > VOICE_NOTE_MAX_DURATION_MS) return false;
  return true;
}

export function revokeObjectUrl(url: string | null | undefined): void {
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // ignore
  }
}

export function stopMediaStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // ignore
    }
  }
}
