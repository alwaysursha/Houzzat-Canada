/**
 * Persist a voice note: private storage + Message (TEXT) + MessageAttachment(VOICE_NOTE).
 * Caller authorizes conversation membership and supplies trusted ids.
 */

import type { MessageAttachment, PrismaClient } from "@prisma/client";
import {
  VOICE_NOTE_MESSAGE_BODY,
} from "@/lib/chat/voice-notes/constants";
import {
  buildVoiceNoteObjectKey,
  normalizeVoiceUploadId,
} from "@/lib/chat/voice-notes/keys";
import { allowVoiceNoteUpload } from "@/lib/chat/voice-notes/rate-limit";
import {
  ChatMediaStorageNotConfiguredError,
  deleteChatMediaObject,
  putChatMediaObject,
} from "@/lib/chat/voice-notes/storage";
import {
  validateVoiceNoteUpload,
  voiceNoteValidationErrorMessage,
} from "@/lib/chat/voice-notes/validation";
import {
  createConversationMessage,
  type ConversationMessageDb,
  type ConversationMessageRecord,
} from "@/lib/conversations/create-conversation-message";

export type VoiceNoteAttachmentView = {
  id: string;
  kind: "VOICE_NOTE";
  mimeType: string;
  byteSize: number;
  durationMs: number | null;
};

export type VoiceNoteSendDb = ConversationMessageDb & {
  message: ConversationMessageDb["message"] &
    Pick<PrismaClient["message"], "update">;
  messageAttachment: Pick<
    PrismaClient["messageAttachment"],
    "findFirst" | "create"
  >;
};

export type SendVoiceNoteInput = {
  workspaceId: string;
  leadId: string;
  conversationId: string;
  senderKind: "CUSTOMER" | "AGENT";
  senderUserId: string;
  senderName: string;
  uploadId: string;
  bytes: Uint8Array;
  mimeType: string | null | undefined;
  durationMs: number | null | undefined;
  replyToMessageId?: string | null;
};

export type SendVoiceNoteResult =
  | {
      ok: true;
      created: boolean;
      message: ConversationMessageRecord;
      attachment: VoiceNoteAttachmentView;
    }
  | {
      ok: false;
      status: number;
      body: unknown;
    };

function presentAttachment(row: MessageAttachment): VoiceNoteAttachmentView {
  return {
    id: row.id,
    kind: "VOICE_NOTE",
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    durationMs: row.durationMs,
  };
}

export async function sendConversationVoiceNote(
  db: VoiceNoteSendDb,
  input: SendVoiceNoteInput,
): Promise<SendVoiceNoteResult> {
  const uploadId = normalizeVoiceUploadId(input.uploadId);
  if (!uploadId) {
    return { ok: false, status: 400, body: { error: "Invalid upload id" } };
  }

  const rate = allowVoiceNoteUpload({
    userId: input.senderUserId,
    workspaceId: input.workspaceId,
  });
  if (!rate.allowed) {
    return {
      ok: false,
      status: 429,
      body: {
        error: "Too many voice notes.",
        code: "RATE_LIMITED",
        retryAfterSec: rate.retryAfterSec,
      },
    };
  }

  const validated = validateVoiceNoteUpload({
    bytes: input.bytes,
    mimeType: input.mimeType,
    durationMs: input.durationMs,
  });
  if (!validated.ok) {
    return {
      ok: false,
      status: 400,
      body: {
        error: voiceNoteValidationErrorMessage(validated.reason),
        code: validated.reason,
      },
    };
  }

  const objectKey = buildVoiceNoteObjectKey({
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    userId: input.senderUserId,
    uploadId,
    ext: validated.ext,
  });

  const existing = await db.messageAttachment.findFirst({
    where: {
      workspaceId: input.workspaceId,
      objectKey,
      kind: "VOICE_NOTE",
      revokedAt: null,
    },
  });
  if (existing) {
    const message = await db.message.findFirst({
      where: {
        id: existing.messageId,
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
      },
    });
    if (message) {
      return {
        ok: true,
        created: false,
        message: message as ConversationMessageRecord,
        attachment: presentAttachment(existing),
      };
    }
  }

  try {
    await putChatMediaObject({
      objectKey,
      bytes: input.bytes,
      contentType: validated.mimeType,
    });
  } catch (error) {
    if (error instanceof ChatMediaStorageNotConfiguredError) {
      return {
        ok: false,
        status: 503,
        body: {
          error: error.message,
          code: error.code,
        },
      };
    }
    return {
      ok: false,
      status: 503,
      body: { error: "Failed to store voice note.", code: "STORAGE_FAILED" },
    };
  }

  const created = await createConversationMessage(db, {
    workspaceId: input.workspaceId,
    leadId: input.leadId,
    channel: "CHAT",
    kind: "TEXT",
    senderKind: input.senderKind,
    senderUserId: input.senderUserId,
    createdByUserId: input.senderUserId,
    senderName: input.senderName,
    body: VOICE_NOTE_MESSAGE_BODY,
    replyToMessageId: input.replyToMessageId ?? null,
  });

  if (!created.ok) {
    await deleteChatMediaObject(objectKey).catch(() => undefined);
    if (created.reason === "INVALID_REPLY") {
      return {
        ok: false,
        status: 400,
        body: { error: "Invalid reply target" },
      };
    }
    return { ok: false, status: 400, body: { error: "Invalid payload" } };
  }

  try {
    const attachment = await db.messageAttachment.create({
      data: {
        workspaceId: input.workspaceId,
        messageId: created.message.id,
        kind: "VOICE_NOTE",
        objectKey,
        mimeType: validated.mimeType,
        byteSize: validated.byteSize,
        durationMs: validated.durationMs,
        sortOrder: 0,
      },
    });
    return {
      ok: true,
      created: created.created,
      message: created.message,
      attachment: presentAttachment(attachment),
    };
  } catch {
    await deleteChatMediaObject(objectKey).catch(() => undefined);
    await db.message
      .update({
        where: { id: created.message.id },
        data: {
          deletedAt: new Date(),
          deletedByUserId: input.senderUserId,
          body: null,
        },
      })
      .catch(() => undefined);
    return {
      ok: false,
      status: 500,
      body: { error: "Failed to save voice note." },
    };
  }
}

export type VoiceAttachmentRow = {
  id: string;
  messageId: string;
  kind: string;
  mimeType: string;
  byteSize: number;
  durationMs: number | null;
  objectKey: string;
  revokedAt: Date | null;
};

export function presentVoiceAttachmentsForClient(
  rows: VoiceAttachmentRow[],
  messageId: string,
): VoiceNoteAttachmentView[] {
  return rows
    .filter(
      (row) =>
        row.messageId === messageId &&
        row.kind === "VOICE_NOTE" &&
        !row.revokedAt,
    )
    .map((row) => ({
      id: row.id,
      kind: "VOICE_NOTE" as const,
      mimeType: row.mimeType,
      byteSize: row.byteSize,
      durationMs: row.durationMs,
    }));
}
