/**
 * Private chat voice-note object keys.
 * Never reuse branding public URL layouts.
 */

const KEY_RE =
  /^workspaces\/([a-zA-Z0-9_-]+)\/chat\/voice\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\.(webm|ogg|m4a|mp3|wav|aac)$/;

export function buildVoiceNoteObjectKey(input: {
  workspaceId: string;
  conversationId: string;
  userId: string;
  uploadId: string;
  ext: string;
}): string {
  return `workspaces/${input.workspaceId}/chat/voice/${input.conversationId}/${input.userId}/${input.uploadId}.${input.ext}`;
}

export function parseVoiceNoteObjectKey(
  objectKey: string,
  workspaceId: string,
): {
  workspaceId: string;
  conversationId: string;
  userId: string;
  uploadId: string;
  ext: string;
} | null {
  const match = KEY_RE.exec(objectKey.trim());
  if (!match) return null;
  if (match[1] !== workspaceId) return null;
  return {
    workspaceId: match[1]!,
    conversationId: match[2]!,
    userId: match[3]!,
    uploadId: match[4]!,
    ext: match[5]!,
  };
}

export function normalizeVoiceUploadId(raw: string | null | undefined): string | null {
  const id = raw?.trim() ?? "";
  if (!id || id.length < 8 || id.length > 64) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  return id;
}
