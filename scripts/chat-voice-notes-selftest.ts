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
  createVoiceMediaRecorder,
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
  ChatMediaStorageNotConfiguredError,
  chatMediaStorageConfiguredSyncHint,
  deleteChatMediaObject,
  getChatMediaObject,
  putChatMediaObject,
  readChatMediaR2S3Config,
  setChatMediaStorageTestDeps,
} from "../src/lib/chat/voice-notes/storage";
import { readVercelR2S3Config } from "../src/lib/tenancy/branding-assets/r2-s3";
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

  const denied = mapMicrophonePermissionError({ name: "NotAllowedError" });
  assert.equal(denied.reason, "DENIED");
  assert.match(denied.message, /address bar|Permissions|Microphone/i);
  const nativeDenied = mapMicrophonePermissionError(
    { name: "NotAllowedError" },
    { nativeApp: true },
  );
  assert.equal(nativeDenied.reason, "DENIED");
  assert.match(nativeDenied.message, /device Settings|Permissions/i);
  assert.equal(
    mapMicrophonePermissionError({ name: "NotFoundError" }).reason,
    "UNAVAILABLE",
  );
  assert.equal(
    mapMicrophonePermissionError({ name: "NotReadableError" }).reason,
    "UNAVAILABLE",
  );
  assert.equal(
    mapMicrophonePermissionError({ name: "SecurityError" }).reason,
    "DENIED",
  );
  assert.equal(
    mapMicrophonePermissionError({ name: "AbortError" }).reason,
    "DISMISSED",
  );

  assert.equal(
    preferredMediaRecorderMimeType((mime) => mime === "audio/webm"),
    "audio/webm",
  );

  // Preferred MIME rejected by constructor → fall back to bare MediaRecorder.
  class FakeRecorder {
    mimeType = "audio/ogg";
    constructor(
      _stream: unknown,
      options?: { mimeType?: string },
    ) {
      if (options?.mimeType) {
        throw new Error("unsupported mime");
      }
    }
  }
  const created = createVoiceMediaRecorder(
    {} as MediaStream,
    () => true,
    FakeRecorder as unknown as typeof MediaRecorder,
  );
  assert.equal(created.mimeType, "audio/ogg");
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
  // Single stable recorder instance (remount on voiceBusy caused a second mic tap).
  assert.equal(customerUi.split("<ChatVoiceRecorder").length - 1, 1);
  assert.ok(customerUi.includes("onErrorChange"));
  assert.ok(customerUi.includes("micError"));
  assert.ok(customerUi.includes("placeholder:truncate"));
  assert.ok(customerUi.includes("min-w-0 flex-1"));

  const agentUi = read("src/components/agent/chat/AgentChatTranscriptPane.tsx");
  assert.ok(agentUi.includes("ChatVoiceRecorder"));
  assert.ok(agentUi.includes("ChatVoicePlayer"));
  assert.ok(agentUi.includes("onSendVoice"));
  assert.equal(agentUi.split("<ChatVoiceRecorder").length - 1, 1);
  assert.ok(agentUi.includes("onErrorChange"));
  assert.ok(agentUi.includes("micError"));
  // Premium mint shell parity with Customer Chat V1.
  assert.ok(agentUi.includes("bg-[#d8f3e7]"));
  assert.ok(agentUi.includes("bg-[#0f6b4c]"));
  assert.equal(agentUi.includes("bg-[#dbeafe]"), false);
  assert.equal(agentUi.includes("bg-[#2b6cb0]"), false);

  const recorder = read("src/components/chat/ChatVoiceRecorder.tsx");
  assert.ok(recorder.includes("createVoiceMediaRecorder"));
  assert.ok(recorder.includes("onErrorChange"));
  assert.ok(recorder.includes("startingRef"));
  assert.ok(recorder.includes("getUserMedia"));
  // Idle = mic button only; parent renders errors above the composer row.
  assert.ok(recorder.includes('aria-label="Record voice note"'));
  assert.equal(recorder.includes("top-[calc(100%"), false);
  assert.equal(recorder.includes("absolute"), false);

  const inbox = read("src/components/agent/chats/AgentChatsInbox.tsx");
  assert.ok(inbox.includes("sendVoiceNote"));

  const host = read("src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx");
  assert.ok(host.includes("sendVoiceNote"));

  const storage = read("src/lib/chat/voice-notes/storage.ts");
  assert.ok(storage.includes("CHAT_MEDIA"));
  assert.ok(storage.includes("CHAT_MEDIA_R2_ACCESS_KEY_ID"));
  assert.ok(storage.includes("CHAT_MEDIA_R2_SECRET_ACCESS_KEY"));
  assert.ok(storage.includes("chat-dedicated"));
  assert.ok(storage.includes("legacy-shared"));
  assert.ok(
    storage.includes("Do not use BRANDING_ASSETS or BRANDING_ASSETS_PUBLIC_BASE_URL"),
  );
  assert.ok(storage.includes("private/chat-media"));
  assert.ok(!storage.includes("branding-assets"));
  // Never log credential secret material.
  assert.ok(!/console\.(log|info|debug|error|warn)\([^)]*secretAccessKey/i.test(storage));
  assert.ok(!/console\.(log|info|debug|error|warn)\([^)]*accessKeyId/i.test(storage));

  const customerVoice = read(
    "src/lib/conversations/customer-conversation-voice.ts",
  );
  assert.ok(customerVoice.includes("VOICE_NOTE_MESSAGE_BODY"));
  assert.ok(!customerVoice.includes("body: multipart"));

  const agentVoice = read("src/lib/conversations/agent-conversation-voice.ts");
  assert.ok(agentVoice.includes("VOICE_NOTE_MESSAGE_BODY"));
  // Playback must stay assignee-gated (M4Z) — not canAccessLead-only.
  assert.ok(agentVoice.includes("assignedAgentId !== ctx.user.id"));
  const playback = agentVoice.slice(
    agentVoice.indexOf("loadAgentLeadVoiceAttachmentAudio"),
  );
  assert.ok(playback.includes("Forbidden"));

  const player = read("src/components/chat/ChatVoicePlayer.tsx");
  assert.ok(player.includes("1.5"));
  assert.ok(player.includes("2"));
  assert.ok(!player.includes("autoPlay"));

  const wrangler = read("wrangler.jsonc");
  assert.ok(wrangler.includes('"binding": "CHAT_MEDIA"'));

  const hint = chatMediaStorageConfiguredSyncHint();
  assert.ok(hint.mode === "local-dev" || hint.mode === "r2-s3" || hint.mode === "missing");

  const envExample = read(".env.example");
  assert.ok(envExample.includes("CHAT_MEDIA_R2_ACCESS_KEY_ID"));
  assert.ok(envExample.includes("CHAT_MEDIA_R2_SECRET_ACCESS_KEY"));
  assert.ok(envExample.includes("dedicated chat credentials"));
}

const CHAT_MEDIA_CREDENTIAL_ENV_KEYS = [
  "CHAT_MEDIA_R2_BUCKET_NAME",
  "CHAT_MEDIA_R2_ACCESS_KEY_ID",
  "CHAT_MEDIA_R2_SECRET_ACCESS_KEY",
  "CHAT_MEDIA_R2_S3_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_S3_ENDPOINT",
  "R2_BUCKET_NAME",
  "VERCEL",
  "NODE_ENV",
] as const;

type ChatMediaCredentialEnvKey = (typeof CHAT_MEDIA_CREDENTIAL_ENV_KEYS)[number];

function applyEnvOverrides(
  overrides: Partial<Record<ChatMediaCredentialEnvKey, string | undefined>>,
): Map<string, string | undefined> {
  const previous = new Map<string, string | undefined>();
  for (const key of CHAT_MEDIA_CREDENTIAL_ENV_KEYS) {
    previous.set(key, process.env[key]);
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      const next = overrides[key];
      if (next === undefined) delete process.env[key];
      else process.env[key] = next;
    } else {
      delete process.env[key];
    }
  }
  return previous;
}

function restoreEnvOverrides(previous: Map<string, string | undefined>): void {
  for (const key of CHAT_MEDIA_CREDENTIAL_ENV_KEYS) {
    const value = previous.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function withEnv(
  overrides: Partial<Record<ChatMediaCredentialEnvKey, string | undefined>>,
  run: () => void,
): void {
  const previous = applyEnvOverrides(overrides);
  try {
    run();
  } finally {
    restoreEnvOverrides(previous);
  }
}

async function withEnvAsync(
  overrides: Partial<Record<ChatMediaCredentialEnvKey, string | undefined>>,
  run: () => Promise<void>,
): Promise<void> {
  const previous = applyEnvOverrides(overrides);
  try {
    await run();
  } finally {
    restoreEnvOverrides(previous);
  }
}

function testChatMediaCredentialSelection() {
  const sharedEndpoint = "https://acct111.r2.cloudflarestorage.com";
  const chatEndpoint = "https://acct222.r2.cloudflarestorage.com";

  // Dedicated chat credentials selected (endpoint may stay shared).
  withEnv(
    {
      CHAT_MEDIA_R2_BUCKET_NAME: "houzzatpro-chat-media",
      CHAT_MEDIA_R2_ACCESS_KEY_ID: "chat-access-key",
      CHAT_MEDIA_R2_SECRET_ACCESS_KEY: "chat-secret-key",
      R2_S3_ENDPOINT: sharedEndpoint,
      R2_ACCESS_KEY_ID: "branding-access-key",
      R2_SECRET_ACCESS_KEY: "branding-secret-key",
      R2_BUCKET_NAME: "houzzatpro-branding-assets",
    },
    () => {
      const cfg = readChatMediaR2S3Config();
      assert.ok(cfg);
      assert.equal(cfg!.credentialSource, "chat-dedicated");
      assert.equal(cfg!.accessKeyId, "chat-access-key");
      assert.equal(cfg!.secretAccessKey, "chat-secret-key");
      assert.equal(cfg!.bucket, "houzzatpro-chat-media");
      assert.equal(cfg!.endpointOrigin, "https://acct111.r2.cloudflarestorage.com");
      // Never substitute branding bucket when chat credentials are active.
      assert.notEqual(cfg!.bucket, "houzzatpro-branding-assets");
      assert.notEqual(cfg!.accessKeyId, "branding-access-key");
    },
  );

  // Optional dedicated chat endpoint override.
  withEnv(
    {
      CHAT_MEDIA_R2_BUCKET_NAME: "houzzatpro-chat-media-preview",
      CHAT_MEDIA_R2_ACCESS_KEY_ID: "chat-access-key",
      CHAT_MEDIA_R2_SECRET_ACCESS_KEY: "chat-secret-key",
      CHAT_MEDIA_R2_S3_ENDPOINT: chatEndpoint,
      R2_S3_ENDPOINT: sharedEndpoint,
      R2_ACCESS_KEY_ID: "branding-access-key",
      R2_SECRET_ACCESS_KEY: "branding-secret-key",
      R2_BUCKET_NAME: "houzzatpro-branding-assets",
    },
    () => {
      const cfg = readChatMediaR2S3Config();
      assert.ok(cfg);
      assert.equal(cfg!.credentialSource, "chat-dedicated");
      assert.equal(cfg!.bucket, "houzzatpro-chat-media-preview");
      assert.equal(cfg!.endpointOrigin, "https://acct222.r2.cloudflarestorage.com");
    },
  );

  // Legacy shared credential fallback when BOTH dedicated vars are absent.
  withEnv(
    {
      CHAT_MEDIA_R2_BUCKET_NAME: "houzzatpro-chat-media",
      R2_ACCESS_KEY_ID: "branding-access-key",
      R2_SECRET_ACCESS_KEY: "branding-secret-key",
      R2_S3_ENDPOINT: sharedEndpoint,
      R2_BUCKET_NAME: "houzzatpro-branding-assets",
    },
    () => {
      const cfg = readChatMediaR2S3Config();
      assert.ok(cfg);
      assert.equal(cfg!.credentialSource, "legacy-shared");
      assert.equal(cfg!.accessKeyId, "branding-access-key");
      assert.equal(cfg!.secretAccessKey, "branding-secret-key");
      assert.equal(cfg!.bucket, "houzzatpro-chat-media");
      assert.notEqual(cfg!.bucket, process.env.R2_BUCKET_NAME);
    },
  );

  // Incomplete dedicated pair → fail closed (no mix with branding secret).
  withEnv(
    {
      CHAT_MEDIA_R2_BUCKET_NAME: "houzzatpro-chat-media",
      CHAT_MEDIA_R2_ACCESS_KEY_ID: "chat-access-key",
      R2_ACCESS_KEY_ID: "branding-access-key",
      R2_SECRET_ACCESS_KEY: "branding-secret-key",
      R2_S3_ENDPOINT: sharedEndpoint,
      R2_BUCKET_NAME: "houzzatpro-branding-assets",
    },
    () => {
      assert.equal(readChatMediaR2S3Config(), null);
    },
  );

  withEnv(
    {
      CHAT_MEDIA_R2_BUCKET_NAME: "houzzatpro-chat-media",
      CHAT_MEDIA_R2_SECRET_ACCESS_KEY: "chat-secret-key",
      R2_ACCESS_KEY_ID: "branding-access-key",
      R2_SECRET_ACCESS_KEY: "branding-secret-key",
      R2_S3_ENDPOINT: sharedEndpoint,
      NODE_ENV: "production",
    },
    () => {
      assert.equal(readChatMediaR2S3Config(), null);
      const hint = chatMediaStorageConfiguredSyncHint();
      assert.equal(hint.configured, false);
      assert.equal(hint.mode, "missing");
      assert.ok(hint.blocker?.includes("incomplete dedicated chat credentials"));
      assert.ok(!hint.blocker?.includes("chat-secret-key"));
      assert.ok(!hint.blocker?.includes("branding-secret-key"));
    },
  );

  // Branding credentials unaffected by chat-dedicated vars.
  withEnv(
    {
      VERCEL: "1",
      R2_ACCESS_KEY_ID: "branding-access-key",
      R2_SECRET_ACCESS_KEY: "branding-secret-key",
      R2_S3_ENDPOINT: sharedEndpoint,
      R2_BUCKET_NAME: "houzzatpro-branding-assets",
      CHAT_MEDIA_R2_BUCKET_NAME: "houzzatpro-chat-media",
      CHAT_MEDIA_R2_ACCESS_KEY_ID: "chat-access-key",
      CHAT_MEDIA_R2_SECRET_ACCESS_KEY: "chat-secret-key",
    },
    () => {
      const branding = readVercelR2S3Config();
      assert.ok(branding);
      assert.equal(branding!.accessKeyId, "branding-access-key");
      assert.equal(branding!.secretAccessKey, "branding-secret-key");
      assert.equal(branding!.bucket, "houzzatpro-branding-assets");

      const chat = readChatMediaR2S3Config();
      assert.ok(chat);
      assert.equal(chat!.credentialSource, "chat-dedicated");
      assert.equal(chat!.accessKeyId, "chat-access-key");
      assert.equal(chat!.bucket, "houzzatpro-chat-media");
      // No cross-bucket credential substitution.
      assert.notEqual(chat!.accessKeyId, branding!.accessKeyId);
      assert.notEqual(chat!.bucket, branding!.bucket);
    },
  );

}

async function testChatMediaProductionFailClosed() {
  await withEnvAsync(
    {
      CHAT_MEDIA_R2_BUCKET_NAME: "houzzatpro-chat-media",
      CHAT_MEDIA_R2_ACCESS_KEY_ID: "chat-only-half",
      NODE_ENV: "production",
    },
    async () => {
      assert.equal(readChatMediaR2S3Config(), null);
      await assert.rejects(
        () =>
          putChatMediaObject({
            objectKey: "workspaces/ws/conversations/c/voice/u.webm",
            bytes: new Uint8Array([1, 2, 3]),
            contentType: "audio/webm",
          }),
        (error: unknown) => error instanceof ChatMediaStorageNotConfiguredError,
      );
    },
  );
}

async function main() {
  testRecordingLifecycleHelpers();
  testAudioValidation();
  testKeysAndClientUpload();
  await testPrivateStorageAndSend();
  testUiWiringAndNoPublicBranding();
  testChatMediaCredentialSelection();
  await testChatMediaProductionFailClosed();
  console.log("chat-voice-notes-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
