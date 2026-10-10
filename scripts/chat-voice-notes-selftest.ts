/**
 * Chat V1 Milestone 3 — two-way voice notes selftest.
 * Run: pnpm chat-voice-notes:selftest
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildVoiceNoteUploadFormData,
  customerChatVoiceAudioRoute,
  customerChatVoiceNoteUploadRoute,
  messageVoiceNoteAttachment,
  newVoiceNoteUploadId,
  agentChatVoiceAudioRoute,
  agentChatVoiceNoteUploadRoute,
} from "../src/lib/chat/voice-notes/client-upload";
import {
  VOICE_NOTE_MAX_BYTES,
  VOICE_NOTE_MAX_DURATION_MS,
  VOICE_NOTE_MESSAGE_BODY,
  VOICE_NOTE_MIN_DURATION_MS,
} from "../src/lib/chat/voice-notes/constants";
import {
  buildVoiceNoteObjectKey,
  normalizeVoiceUploadId,
  parseVoiceNoteObjectKey,
} from "../src/lib/chat/voice-notes/keys";
import {
  allowVoiceNoteUpload,
  clearVoiceNoteUploadRateLimitsForTests,
} from "../src/lib/chat/voice-notes/rate-limit";
import {
  canSendRecordedVoiceNote,
  formatVoiceDurationMs,
  mapMicrophonePermissionError,
  preferredMediaRecorderMimeType,
  probeVoiceRecordingSupport,
} from "../src/lib/chat/voice-notes/recording-client";
import {
  presentVoiceAttachmentsForClient,
  sendConversationVoiceNote,
} from "../src/lib/chat/voice-notes/send";
import {
  chatMediaStorageConfiguredSyncHint,
  deleteChatMediaObject,
  getChatMediaObject,
  putChatMediaObject,
  setChatMediaStorageTestDeps,
} from "../src/lib/chat/voice-notes/storage";
import {
  validateVoiceNoteUpload,
  voiceNoteValidationErrorMessage,
} from "../src/lib/chat/voice-notes/validation";
import { loadAuthorizedVoiceAttachmentAudio } from "../src/lib/chat/voice-notes/attachments";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function webmBytes(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes[0] = 0x1a;
  bytes[1] = 0x45;
  bytes[2] = 0xdf;
  bytes[3] = 0xa3;
  for (let i = 4; i < size; i += 1) bytes[i] = (i * 17) & 0xff;
  return bytes;
}

function testRecordingLifecycleHelpers() {
  assert.equal(
    probeVoiceRecordingSupport({
      hasMediaDevices: true,
      hasMediaRecorder: true,
      isSecureContext: true,
    }).ok,
    true,
  );
  assert.equal(
    probeVoiceRecordingSupport({
      hasMediaDevices: true,
      hasMediaRecorder: true,
      isSecureContext: false,
    }).ok,
    false,
  );
  assert.equal(
    probeVoiceRecordingSupport({
      hasMediaDevices: false,
      hasMediaRecorder: true,
      isSecureContext: true,
    }).ok,
    false,
  );
  assert.equal(
    probeVoiceRecordingSupport({
      hasMediaDevices: true,
      hasMediaRecorder: false,
      isSecureContext: true,
    }).ok,
    false,
  );

  assert.equal(
    mapMicrophonePermissionError({ name: "NotAllowedError" }).reason,
    "DENIED",
  );
  assert.equal(
    mapMicrophonePermissionError({ name: "NotFoundError" }).reason,
    "UNAVAILABLE",
  );
  assert.equal(
    mapMicrophonePermissionError({ name: "AbortError" }).reason,
    "DISMISSED",
  );

  assert.equal(
    preferredMediaRecorderMimeType((mime) => mime === "audio/webm"),
    "audio/webm",
  );
  assert.equal(formatVoiceDurationMs(65_000), "1:05");
  assert.equal(
    canSendRecordedVoiceNote({
      durationMs: VOICE_NOTE_MIN_DURATION_MS,
      byteSize: 12,
      sending: false,
    }),
    true,
  );
  assert.equal(
    canSendRecordedVoiceNote({
      durationMs: 100,
      byteSize: 12,
      sending: false,
    }),
    false,
  );
  assert.equal(
    canSendRecordedVoiceNote({
      durationMs: VOICE_NOTE_MIN_DURATION_MS,
      byteSize: 12,
      sending: true,
    }),
    false,
  );
}

function testAudioValidation() {
  const ok = validateVoiceNoteUpload({
    bytes: webmBytes(),
    mimeType: "audio/webm",
    durationMs: 1500,
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.ext, "webm");
    assert.equal(ok.durationMs, 1500);
  }

  assert.equal(
    validateVoiceNoteUpload({
      bytes: new Uint8Array(0),
      mimeType: "audio/webm",
      durationMs: 1500,
    }).ok,
    false,
  );
  assert.equal(
    validateVoiceNoteUpload({
      bytes: webmBytes(VOICE_NOTE_MAX_BYTES + 1),
      mimeType: "audio/webm",
      durationMs: 1500,
    }).reason,
    "TOO_LARGE",
  );
  assert.equal(
    validateVoiceNoteUpload({
      bytes: webmBytes(),
      mimeType: "image/png",
      durationMs: 1500,
    }).reason,
    "UNSUPPORTED_TYPE",
  );
  assert.equal(
    validateVoiceNoteUpload({
      bytes: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
      mimeType: "audio/webm",
      durationMs: 1500,
    }).reason,
    "UNSUPPORTED_TYPE",
  );
  assert.equal(
    validateVoiceNoteUpload({
      bytes: webmBytes(),
      mimeType: "audio/webm",
      durationMs: VOICE_NOTE_MAX_DURATION_MS + 1,
    }).reason,
    "TOO_LONG",
  );
  assert.equal(
    voiceNoteValidationErrorMessage("TOO_SHORT"),
    "Recording is too short.",
  );
}

function testKeysAndClientUpload() {
  const key = buildVoiceNoteObjectKey({
    workspaceId: "ws1",
    conversationId: "c1",
    userId: "u1",
    uploadId: "upload1234",
    ext: "webm",
  });
  assert.equal(
    key,
    "workspaces/ws1/chat/voice/c1/u1/upload1234.webm",
  );
  const parsed = parseVoiceNoteObjectKey(key, "ws1");
  assert.ok(parsed);
  assert.equal(parsed?.conversationId, "c1");
  assert.equal(parseVoiceNoteObjectKey(key, "other"), null);
  assert.equal(normalizeVoiceUploadId("short"), null);
  assert.ok(normalizeVoiceUploadId("upload-id-12"));

  const uploadId = newVoiceNoteUploadId();
  assert.ok(normalizeVoiceUploadId(uploadId));
  const form = buildVoiceNoteUploadFormData({
    blob: new Blob([webmBytes()], { type: "audio/webm" }),
    mimeType: "audio/webm",
    durationMs: 1200,
    uploadId,
    replyToMessageId: "msg1",
  });
  assert.ok(form.get("file") instanceof Blob);
  assert.equal(form.get("durationMs"), "1200");
  assert.equal(form.get("uploadId"), uploadId);
  assert.equal(form.get("replyToMessageId"), "msg1");

  assert.equal(
    customerChatVoiceNoteUploadRoute(),
    "/api/account/conversation/voice-notes",
  );
  assert.equal(
    customerChatVoiceAudioRoute("m1", "a1"),
    "/api/account/conversation/messages/m1/attachments/a1/audio",
  );
  assert.equal(
    agentChatVoiceNoteUploadRoute("lead1"),
    "/api/agent/leads/lead1/conversation/voice-notes",
  );
  assert.equal(
    agentChatVoiceAudioRoute("lead1", "m1", "a1"),
    "/api/agent/leads/lead1/conversation/messages/m1/attachments/a1/audio",
  );
  assert.equal(
    messageVoiceNoteAttachment([
      { id: "a1", kind: "VOICE_NOTE" },
    ])?.id,
    "a1",
  );
}

async function testPrivateStorageAndSend() {
  const localRoot = mkdtempSync(join(tmpdir(), "chat-media-"));
  const memory = new Map<string, Uint8Array>();
  setChatMediaStorageTestDeps({
    isProduction: () => false,
    localRoot,
    getBucket: async () => ({
      async put(key, value) {
        const bytes =
          value instanceof ArrayBuffer
            ? new Uint8Array(value)
            : typeof value === "string"
              ? new TextEncoder().encode(value)
              : new Uint8Array(
                  (value as ArrayBufferView).buffer,
                  (value as ArrayBufferView).byteOffset,
                  (value as ArrayBufferView).byteLength,
                );
        memory.set(key, bytes);
      },
      async get(key) {
        const bytes = memory.get(key);
        if (!bytes) return null;
        return {
          arrayBuffer: async () =>
            bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ),
          httpMetadata: { contentType: "audio/webm" },
        };
      },
      async delete(key) {
        for (const k of Array.isArray(key) ? key : [key]) memory.delete(k);
      },
    }),
  });

  try {
    clearVoiceNoteUploadRateLimitsForTests();
    const objectKey = buildVoiceNoteObjectKey({
      workspaceId: "wsA",
      conversationId: "convA",
      userId: "userA",
      uploadId: "uploadabcd",
      ext: "webm",
    });
    await putChatMediaObject({
      objectKey,
      bytes: webmBytes(),
      contentType: "audio/webm",
    });
    const got = await getChatMediaObject({ objectKey });
    assert.ok(got);
    assert.equal(got?.bytes.byteLength, 64);
    await deleteChatMediaObject(objectKey);
    assert.equal(await getChatMediaObject({ objectKey }), null);

    type Msg = {
      id: string;
      workspaceId: string;
      conversationId: string;
      leadId: string;
      channel: string;
      kind: string;
      senderKind: string;
      senderUserId: string | null;
      createdByUserId: string | null;
      senderName: string;
      body: string | null;
      replyToMessageId: string | null;
      deliveredAt: Date | null;
      deletedAt: Date | null;
      deletedByUserId: string | null;
      payload: unknown;
      createdAt: Date;
      smsSource: string | null;
      twilioMessageSid: string | null;
      providerStatus: string | null;
      smsFrom: string | null;
      smsTo: string | null;
    };
    type Att = {
      id: string;
      workspaceId: string;
      messageId: string;
      kind: string;
      objectKey: string;
      mimeType: string;
      byteSize: number;
      durationMs: number | null;
      revokedAt: Date | null;
      sortOrder: number;
    };

    const messages: Msg[] = [];
    const attachments: Att[] = [];
    const conversation = {
      id: "convA",
      workspaceId: "wsA",
      leadId: "leadA",
      status: "OPEN",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: null as Date | null,
      customerLastReadAt: null,
      agentLastReadAt: null,
      agentLastReadByUserId: null,
    };

    const fullDb = {
      lead: {
        findUnique: async () => ({ id: "leadA", workspaceId: "wsA" }),
      },
      conversation: {
        findUnique: async () => conversation,
        create: async () => conversation,
        update: async ({ data }: { data: { lastMessageAt?: Date } }) => {
          if (data.lastMessageAt) conversation.lastMessageAt = data.lastMessageAt;
          return conversation;
        },
      },
      message: {
        findUnique: async () => null,
        findFirst: async (args: {
          where: {
            id?: string;
            workspaceId?: string;
            conversationId?: string;
          };
        }) => {
          return (
            messages.find((m) => {
              if (args.where.id && m.id !== args.where.id) return false;
              if (
                args.where.workspaceId &&
                m.workspaceId !== args.where.workspaceId
              ) {
                return false;
              }
              if (
                args.where.conversationId &&
                m.conversationId !== args.where.conversationId
              ) {
                return false;
              }
              return true;
            }) ?? null
          );
        },
        create: async ({
          data,
          select,
        }: {
          data: Record<string, unknown>;
          select?: Record<string, boolean>;
        }) => {
          const row: Msg = {
            id: `msg_${messages.length + 1}`,
            workspaceId: String(data.workspaceId),
            conversationId: String(data.conversationId),
            leadId: String(data.leadId),
            channel: String(data.channel),
            kind: String(data.kind),
            senderKind: String(data.senderKind),
            senderUserId: (data.senderUserId as string | null) ?? null,
            createdByUserId: (data.createdByUserId as string | null) ?? null,
            senderName: String(data.senderName),
            body: (data.body as string | null) ?? null,
            replyToMessageId: (data.replyToMessageId as string | null) ?? null,
            deliveredAt: null,
            deletedAt: null,
            deletedByUserId: null,
            payload: data.payload ?? null,
            createdAt: (data.createdAt as Date) ?? new Date(),
            smsSource: null,
            twilioMessageSid: null,
            providerStatus: null,
            smsFrom: null,
            smsTo: null,
          };
          messages.push(row);
          if (!select) return row;
          const picked: Record<string, unknown> = {};
          for (const key of Object.keys(select)) {
            if (select[key]) picked[key] = row[key as keyof Msg];
          }
          return picked;
        },
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<Msg>;
        }) => {
          const row = messages.find((m) => m.id === where.id);
          if (!row) throw new Error("missing message");
          Object.assign(row, data);
          return row;
        },
      },
      messageAttachment: {
        findFirst: async (args: {
          where: {
            objectKey?: string;
            id?: string;
            workspaceId?: string;
            messageId?: string;
            kind?: string;
            revokedAt?: null;
          };
        }) => {
          return (
            attachments.find((a) => {
              if (args.where.objectKey && a.objectKey !== args.where.objectKey) {
                return false;
              }
              if (args.where.id && a.id !== args.where.id) return false;
              if (
                args.where.workspaceId &&
                a.workspaceId !== args.where.workspaceId
              ) {
                return false;
              }
              if (
                args.where.messageId &&
                a.messageId !== args.where.messageId
              ) {
                return false;
              }
              if (args.where.kind && a.kind !== args.where.kind) return false;
              if (args.where.revokedAt === null && a.revokedAt) return false;
              return true;
            }) ?? null
          );
        },
        findMany: async () => attachments,
        create: async ({ data }: { data: Omit<Att, "id" | "revokedAt"> }) => {
          const row: Att = {
            ...data,
            id: `att_${attachments.length + 1}`,
            revokedAt: null,
          };
          attachments.push(row);
          return row;
        },
      },
      $transaction: async <T,>(fn: (tx: unknown) => Promise<T>) =>
        fn({
          message: fullDb.message,
          conversation: fullDb.conversation,
        }),
    };

    const first = await sendConversationVoiceNote(fullDb as never, {
      workspaceId: "wsA",
      leadId: "leadA",
      conversationId: "convA",
      senderKind: "CUSTOMER",
      senderUserId: "userA",
      senderName: "Customer",
      uploadId: "uploadabcd",
      bytes: webmBytes(),
      mimeType: "audio/webm",
      durationMs: 2000,
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.created, true);
    assert.equal(first.message.body, VOICE_NOTE_MESSAGE_BODY);
    assert.equal(first.attachment.kind, "VOICE_NOTE");
    assert.equal(messages.length, 1);
    assert.equal(attachments.length, 1);

    const retry = await sendConversationVoiceNote(fullDb as never, {
      workspaceId: "wsA",
      leadId: "leadA",
      conversationId: "convA",
      senderKind: "CUSTOMER",
      senderUserId: "userA",
      senderName: "Customer",
      uploadId: "uploadabcd",
      bytes: webmBytes(),
      mimeType: "audio/webm",
      durationMs: 2000,
    });
    assert.equal(retry.ok, true);
    if (retry.ok) {
      assert.equal(retry.created, false);
      assert.equal(retry.message.id, first.message.id);
    }
    assert.equal(messages.length, 1);

    const presented = presentVoiceAttachmentsForClient(
      attachments,
      first.message.id,
    );
    assert.equal(presented.length, 1);
    assert.equal("objectKey" in (presented[0] as object), false);

    const audio = await loadAuthorizedVoiceAttachmentAudio(fullDb as never, {
      workspaceId: "wsA",
      conversationId: "convA",
      messageId: first.message.id,
      attachmentId: first.attachment.id,
    });
    assert.equal(audio.ok, true);

    const crossTenant = await loadAuthorizedVoiceAttachmentAudio(
      fullDb as never,
      {
        workspaceId: "wsB",
        conversationId: "convA",
        messageId: first.message.id,
        attachmentId: first.attachment.id,
      },
    );
    assert.equal(crossTenant.ok, false);

    const crossConv = await loadAuthorizedVoiceAttachmentAudio(
      fullDb as never,
      {
        workspaceId: "wsA",
        conversationId: "convOther",
        messageId: first.message.id,
        attachmentId: first.attachment.id,
      },
    );
    assert.equal(crossConv.ok, false);

    const failed = await sendConversationVoiceNote(fullDb as never, {
      workspaceId: "wsA",
      leadId: "leadA",
      conversationId: "convA",
      senderKind: "AGENT",
      senderUserId: "agent1",
      senderName: "Agent",
      uploadId: "uploadfail01",
      bytes: webmBytes(),
      mimeType: "text/plain",
      durationMs: 2000,
    });
    assert.equal(failed.ok, false);
    assert.equal(messages.length, 1);

    clearVoiceNoteUploadRateLimitsForTests();
    let blocked = false;
    for (let i = 0; i < 25; i += 1) {
      const rate = allowVoiceNoteUpload({
        userId: "rate-user",
        workspaceId: "wsA",
      });
      if (!rate.allowed) {
        blocked = true;
        break;
      }
    }
    assert.equal(blocked, true);
  } finally {
    setChatMediaStorageTestDeps(null);
    rmSync(localRoot, { recursive: true, force: true });
  }
}

function testUiWiringAndNoPublicBranding() {
  const customerUi = read("src/components/customer-chat/CustomerChatScreen.tsx");
  assert.ok(customerUi.includes("ChatVoiceRecorder"));
  assert.ok(customerUi.includes("ChatVoicePlayer"));
  assert.ok(customerUi.includes("sendVoiceNote"));

  const agentUi = read("src/components/agent/chat/AgentChatTranscriptPane.tsx");
  assert.ok(agentUi.includes("ChatVoiceRecorder"));
  assert.ok(agentUi.includes("ChatVoicePlayer"));
  assert.ok(agentUi.includes("onSendVoice"));

  const inbox = read("src/components/agent/chats/AgentChatsInbox.tsx");
  assert.ok(inbox.includes("sendVoiceNote"));

  const host = read("src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx");
  assert.ok(host.includes("sendVoiceNote"));

  const storage = read("src/lib/chat/voice-notes/storage.ts");
  assert.ok(storage.includes("CHAT_MEDIA"));
  assert.ok(
    storage.includes("Do not use BRANDING_ASSETS or BRANDING_ASSETS_PUBLIC_BASE_URL"),
  );
  assert.ok(storage.includes("private/chat-media"));
  assert.ok(!storage.includes("branding-assets"));

  const customerVoice = read(
    "src/lib/conversations/customer-conversation-voice.ts",
  );
  assert.ok(customerVoice.includes("VOICE_NOTE_MESSAGE_BODY"));
  assert.ok(!customerVoice.includes("body: multipart"));

  const agentVoice = read("src/lib/conversations/agent-conversation-voice.ts");
  assert.ok(agentVoice.includes("VOICE_NOTE_MESSAGE_BODY"));

  const player = read("src/components/chat/ChatVoicePlayer.tsx");
  assert.ok(player.includes("1.5"));
  assert.ok(player.includes("2"));
  assert.ok(!player.includes("autoPlay"));

  const wrangler = read("wrangler.jsonc");
  assert.ok(wrangler.includes('"binding": "CHAT_MEDIA"'));

  const hint = chatMediaStorageConfiguredSyncHint();
  assert.ok(hint.mode === "local-dev" || hint.mode === "r2-s3" || hint.mode === "missing");
}

async function main() {
  testRecordingLifecycleHelpers();
  testAudioValidation();
  testKeysAndClientUpload();
  await testPrivateStorageAndSend();
  testUiWiringAndNoPublicBranding();
  console.log("chat-voice-notes-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
