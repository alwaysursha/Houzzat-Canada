/** Voice-note limits and canonical transcript body. */

export const VOICE_NOTE_MESSAGE_BODY = "Voice note";

export const VOICE_NOTE_MAX_BYTES = 5 * 1024 * 1024; // 5 MiB
export const VOICE_NOTE_MAX_DURATION_MS = 120_000; // 2 minutes
export const VOICE_NOTE_MIN_DURATION_MS = 400;

export const VOICE_NOTE_MIME_TYPES = [
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
] as const;

export const VOICE_NOTE_EXT_BY_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/webm;codecs=opus": "webm",
  "audio/ogg": "ogg",
  "audio/ogg;codecs=opus": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/aac": "aac",
};

export const CHAT_MEDIA_STORAGE_NOT_CONFIGURED = "STORAGE_NOT_CONFIGURED" as const;

export const VOICE_NOTE_PLAYBACK_SPEEDS = [1, 1.5, 2] as const;
export type VoiceNotePlaybackSpeed = (typeof VOICE_NOTE_PLAYBACK_SPEEDS)[number];
