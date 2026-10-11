import {
  VOICE_NOTE_EXT_BY_MIME,
  VOICE_NOTE_MAX_BYTES,
  VOICE_NOTE_MAX_DURATION_MS,
  VOICE_NOTE_MIN_DURATION_MS,
  VOICE_NOTE_MIME_TYPES,
} from "@/lib/chat/voice-notes/constants";

export type VoiceNoteValidationOk = {
  ok: true;
  mimeType: string;
  ext: string;
  byteSize: number;
  durationMs: number;
};

export type VoiceNoteValidationFail = {
  ok: false;
  reason:
    | "EMPTY"
    | "TOO_LARGE"
    | "UNSUPPORTED_TYPE"
    | "INVALID_DURATION"
    | "TOO_SHORT"
    | "TOO_LONG";
};

const MIME_SET = new Set<string>(
  VOICE_NOTE_MIME_TYPES.map((value) => value.toLowerCase()),
);

export function normalizeVoiceMimeType(raw: string | null | undefined): string | null {
  const mime = raw?.trim().toLowerCase() ?? "";
  if (!mime) return null;
  if (MIME_SET.has(mime)) return mime;
  const base = mime.split(";")[0]?.trim() ?? "";
  if (base && MIME_SET.has(base)) return base;
  return null;
}

export function validateVoiceNoteUpload(input: {
  bytes: Uint8Array;
  mimeType: string | null | undefined;
  durationMs: number | null | undefined;
}): VoiceNoteValidationOk | VoiceNoteValidationFail {
  if (!input.bytes.length) return { ok: false, reason: "EMPTY" };
  if (input.bytes.byteLength > VOICE_NOTE_MAX_BYTES) {
    return { ok: false, reason: "TOO_LARGE" };
  }
  const mimeType = normalizeVoiceMimeType(input.mimeType);
  if (!mimeType) return { ok: false, reason: "UNSUPPORTED_TYPE" };
  const ext = VOICE_NOTE_EXT_BY_MIME[mimeType];
  if (!ext) return { ok: false, reason: "UNSUPPORTED_TYPE" };

  const durationMs = input.durationMs;
  if (
    durationMs == null ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0
  ) {
    return { ok: false, reason: "INVALID_DURATION" };
  }
  const rounded = Math.round(durationMs);
  if (rounded < VOICE_NOTE_MIN_DURATION_MS) {
    return { ok: false, reason: "TOO_SHORT" };
  }
  if (rounded > VOICE_NOTE_MAX_DURATION_MS) {
    return { ok: false, reason: "TOO_LONG" };
  }

  // Reject obvious non-audio magic for common containers (best-effort).
  if (!looksLikeAudioBytes(input.bytes, mimeType)) {
    return { ok: false, reason: "UNSUPPORTED_TYPE" };
  }

  return {
    ok: true,
    mimeType,
    ext,
    byteSize: input.bytes.byteLength,
    durationMs: rounded,
  };
}

function looksLikeAudioBytes(bytes: Uint8Array, mimeType: string): boolean {
  if (bytes.length < 12) return false;
  const head = String.fromCharCode(...bytes.slice(0, 4));
  if (mimeType.startsWith("audio/wav") || mimeType === "audio/x-wav") {
    return head === "RIFF";
  }
  if (mimeType.startsWith("audio/ogg")) {
    return head === "OggS";
  }
  if (mimeType === "audio/mpeg") {
    return (
      (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) || head === "ID3\u0003" || head.startsWith("ID3")
    );
  }
  if (mimeType.startsWith("audio/webm")) {
    // EBML header 0x1A45DFA3
    return (
      bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3
    );
  }
  if (mimeType === "audio/mp4" || mimeType === "audio/aac") {
    // ftyp box often at offset 4
    const box = String.fromCharCode(...bytes.slice(4, 8));
    return box === "ftyp" || bytes[0] === 0xff;
  }
  return true;
}

export function voiceNoteValidationErrorMessage(
  reason: VoiceNoteValidationFail["reason"],
): string {
  switch (reason) {
    case "EMPTY":
      return "Recording is empty.";
    case "TOO_LARGE":
      return "Voice note is too large.";
    case "UNSUPPORTED_TYPE":
      return "Unsupported audio format.";
    case "INVALID_DURATION":
      return "Couldn’t read recording duration.";
    case "TOO_SHORT":
      return "Recording is too short.";
    case "TOO_LONG":
      return "Recording is too long.";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}
