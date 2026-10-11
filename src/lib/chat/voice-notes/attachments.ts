/**
 * Load VOICE_NOTE attachments for transcript enrichment.
 * Never returns objectKey to clients.
 */

import type { PrismaClient } from "@prisma/client";
import {
  presentVoiceAttachmentsForClient,
  type VoiceNoteAttachmentView,
} from "@/lib/chat/voice-notes/send";
import {
  ChatMediaStorageNotConfiguredError,
  getChatMediaObject,
} from "@/lib/chat/voice-notes/storage";
import { parseVoiceNoteObjectKey } from "@/lib/chat/voice-notes/keys";

export type VoiceAttachmentLookupDb = {
  messageAttachment: Pick<PrismaClient["messageAttachment"], "findMany" | "findFirst">;
  message: Pick<PrismaClient["message"], "findFirst">;
};

export async function loadVoiceAttachmentsByMessageIds(
  db: VoiceAttachmentLookupDb,
  input: {
    workspaceId: string;
    messageIds: string[];
  },
): Promise<Map<string, VoiceNoteAttachmentView[]>> {
  const map = new Map<string, VoiceNoteAttachmentView[]>();
  const ids = [
    ...new Set(input.messageIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (ids.length === 0) return map;

  const rows = await db.messageAttachment.findMany({
    where: {
      workspaceId: input.workspaceId,
      messageId: { in: ids },
      kind: "VOICE_NOTE",
      revokedAt: null,
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  for (const messageId of ids) {
    map.set(
      messageId,
      presentVoiceAttachmentsForClient(rows, messageId),
    );
  }
  return map;
}

export async function loadAuthorizedVoiceAttachmentAudio(
  db: VoiceAttachmentLookupDb,
  input: {
    workspaceId: string;
    conversationId: string;
    messageId: string;
    attachmentId: string;
  },
): Promise<
  | { ok: true; bytes: Uint8Array; mimeType: string }
  | { ok: false; reason: "NOT_FOUND" | "STORAGE" }
> {
  const attachment = await db.messageAttachment.findFirst({
    where: {
      id: input.attachmentId,
      workspaceId: input.workspaceId,
      messageId: input.messageId,
      kind: "VOICE_NOTE",
      revokedAt: null,
    },
  });
  if (!attachment) return { ok: false, reason: "NOT_FOUND" };

  const parsed = parseVoiceNoteObjectKey(
    attachment.objectKey,
    input.workspaceId,
  );
  if (!parsed || parsed.conversationId !== input.conversationId) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  const message = await db.message.findFirst({
    where: {
      id: input.messageId,
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
    },
    select: { id: true },
  });
  if (!message) return { ok: false, reason: "NOT_FOUND" };

  try {
    const object = await getChatMediaObject({ objectKey: attachment.objectKey });
    if (!object) return { ok: false, reason: "NOT_FOUND" };
    return {
      ok: true,
      bytes: object.bytes,
      mimeType: object.contentType || attachment.mimeType,
    };
  } catch (error) {
    if (error instanceof ChatMediaStorageNotConfiguredError) {
      return { ok: false, reason: "STORAGE" };
    }
    return { ok: false, reason: "STORAGE" };
  }
}
