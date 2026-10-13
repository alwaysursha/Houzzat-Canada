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

/** Detect Capacitor native shell without importing @capacitor/core (SSR-safe). */
export function isNativeCapacitorShell(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (
    window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean };
    }
  ).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function mapMicrophonePermissionError(
  error: unknown,
  opts?: { nativeApp?: boolean },
): VoicePermissionFailure {
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name?: unknown }).name)
      : "";
  const native =
    opts?.nativeApp ??
    (typeof window !== "undefined" ? isNativeCapacitorShell() : false);
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return {
      reason: "DENIED",
      message: native
        ? "Microphone access was denied. Open your device Settings → Apps → Houzzat → Permissions → Microphone → Allow, then try again."
        : "Microphone access was denied. Tap the lock icon near the address bar → Permissions → Microphone → Allow, then try again.",
    };
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return {
      reason: "UNAVAILABLE",
      message: "No microphone was found on this device.",
    };
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return {
      reason: "UNAVAILABLE",
      message:
        "Microphone is busy or blocked by another app. Close other apps using the mic, then try again.",
    };
  }
  if (name === "SecurityError") {
    return {
      reason: "DENIED",
      message: native
        ? "Microphone is blocked for Houzzat. Enable Microphone in device Settings, then try again."
        : "Microphone is blocked in this browser. Allow mic access for this site, then try again.",
    };
  }
  if (name === "AbortError") {
    return {
      reason: "DISMISSED",
      message: "Microphone permission was dismissed. Tap the mic and allow access when prompted.",
    };
  }
  return {
    reason: "UNAVAILABLE",
    message: "Couldn’t start the microphone. Please try again.",
  };
}

/** Create MediaRecorder with preferred MIME, falling back if the type is rejected. */
export function createVoiceMediaRecorder(
  stream: MediaStream,
  isTypeSupported: (mime: string) => boolean,
  MediaRecorderCtor: typeof MediaRecorder,
): { recorder: MediaRecorder; mimeType: string } {
  const preferred = preferredMediaRecorderMimeType(isTypeSupported);
  if (preferred) {
    try {
      const recorder = new MediaRecorderCtor(stream, { mimeType: preferred });
      return {
        recorder,
        mimeType: recorder.mimeType || preferred,
      };
    } catch {
      // Fall through — some Android WebViews reject options even when
      // isTypeSupported returns true.
    }
  }
  const recorder = new MediaRecorderCtor(stream);
  return {
    recorder,
    mimeType: recorder.mimeType || preferred || "audio/webm",
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
