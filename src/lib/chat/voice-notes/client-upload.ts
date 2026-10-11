/**
 * Client-safe voice-note upload helpers (FormData + routes).
 */

export function buildVoiceNoteUploadFormData(input: {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  uploadId: string;
  replyToMessageId?: string | null;
}): FormData {
  const form = new FormData();
  const ext = voiceNoteFileExtension(input.mimeType);
  form.append(
    "file",
    input.blob,
    `voice-note.${ext}`,
  );
  form.append("durationMs", String(Math.round(input.durationMs)));
  form.append("uploadId", input.uploadId);
  const reply = input.replyToMessageId?.trim();
  if (reply) form.append("replyToMessageId", reply);
  return form;
}

export function newVoiceNoteUploadId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `vn${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function voiceNoteFileExtension(mimeType: string): string {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  switch (base) {
    case "audio/webm":
      return "webm";
    case "audio/ogg":
      return "ogg";
    case "audio/mp4":
      return "m4a";
    case "audio/mpeg":
      return "mp3";
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/aac":
      return "aac";
    default:
      return "webm";
  }
}

export function customerChatVoiceNoteUploadRoute(): string {
  return "/api/account/conversation/voice-notes";
}

export function customerChatVoiceAudioRoute(
  messageId: string,
  attachmentId: string,
): string {
  return `/api/account/conversation/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/audio`;
}

export function agentChatVoiceNoteUploadRoute(leadId: string): string {
  return `/api/agent/leads/${encodeURIComponent(leadId)}/conversation/voice-notes`;
}

export function agentChatVoiceAudioRoute(
  leadId: string,
  messageId: string,
  attachmentId: string,
): string {
  return `/api/agent/leads/${encodeURIComponent(leadId)}/conversation/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/audio`;
}

export function messageVoiceNoteAttachment<
  T extends { kind: string; id: string },
>(attachments: T[] | null | undefined): T | null {
  if (!attachments?.length) return null;
  return attachments.find((row) => row.kind === "VOICE_NOTE") ?? null;
}
