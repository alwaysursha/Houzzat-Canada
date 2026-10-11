/**
 * Customer voice-note upload + authorized audio playback.
 */

import { isConsumerRole } from "@/lib/roles";
import {
  loadAuthorizedVoiceAttachmentAudio,
} from "@/lib/chat/voice-notes/attachments";
import { readVoiceNoteMultipart } from "@/lib/chat/voice-notes/http";
import {
  sendConversationVoiceNote,
  type VoiceNoteSendDb,
} from "@/lib/chat/voice-notes/send";
import {
  enrichChatMessages,
} from "@/lib/conversations/chat-rich-features";
import {
  ensureCustomerChatLead,
  frozenCustomerChatDisplayName,
  resolveCustomerChatLead,
} from "@/lib/conversations/customer-chat-lead";
import {
  findLeadConversation,
  getOrCreateLeadConversation,
} from "@/lib/conversations/lead-conversation";
import {
  presentCustomerConversationMessage,
  type CustomerConversationApiDeps,
  type CustomerConversationHttpResult,
  type CustomerSendAccess,
} from "@/lib/conversations/customer-conversation";
import {
  recordConversationLeadActivity,
} from "@/lib/conversations/sms-lead-activity";
import { scheduleNotifyAssignedAgentOfCustomerChatMessage } from "@/lib/notifications/customer-chat-agent-push";
import {
  resolveWorkspaceFromRequest,
} from "@/lib/tenancy/resolve-workspace-host";
import { requireFullCustomerUser } from "@/lib/account";
import { VOICE_NOTE_MESSAGE_BODY } from "@/lib/chat/voice-notes/constants";
import {
  clearConversationTypingOnSend,
  type ConversationTypingDb,
} from "@/lib/chat/typing/update";

function jsonResult(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): CustomerConversationHttpResult {
  return { status, body, headers: headers ?? {} };
}

async function defaultRequireSendAccess(): Promise<CustomerSendAccess> {
  const access = await requireFullCustomerUser();
  if (access.denied) {
    let body: unknown = { error: "Sign in required.", requiresAuth: true };
    try {
      body = await access.denied.clone().json();
    } catch {
      // keep default
    }
    return { ok: false, status: access.denied.status, body };
  }
  return { ok: true, user: access.user };
}

export async function handleCustomerConversationVoiceNoteSend(
  request: Request,
  deps: CustomerConversationApiDeps,
): Promise<CustomerConversationHttpResult> {
  const requireSendAccess = deps.requireSendAccess ?? defaultRequireSendAccess;
  const access = await requireSendAccess();
  if (!access.ok) return jsonResult(access.status, access.body);
  if (!isConsumerRole(access.user.role)) {
    return jsonResult(404, { error: "Not found" });
  }

  const host = await (deps.resolveWorkspaceFromRequest ??
    resolveWorkspaceFromRequest)(request, deps.hostDeps);
  if (!host.ok) return jsonResult(404, { error: "Not found" });

  const multipart = await readVoiceNoteMultipart(request);
  if (!multipart.ok) {
    return jsonResult(400, { error: multipart.error });
  }

  const ensured = await (deps.ensureCustomerChatLead ?? ensureCustomerChatLead)({
    request,
    untrustedClientHints: null,
    hostDeps: deps.hostDeps,
    deps: deps.resolverDeps,
  });
  if (!ensured.ok) {
    return jsonResult(404, { error: "Not found" });
  }

  const existing = await findLeadConversation(deps.db, {
    workspaceId: ensured.workspaceId,
    leadId: ensured.leadId,
  });
  if (existing?.status === "BLOCKED") {
    return jsonResult(403, {
      error: "Chat is unavailable.",
      code: "CHAT_BLOCKED",
    });
  }
  const createdConversation = existing
    ? { ok: true as const, conversation: existing, created: false }
    : await getOrCreateLeadConversation(deps.db, {
        workspaceId: ensured.workspaceId,
        leadId: ensured.leadId,
      });
  if (!createdConversation.ok) {
    return jsonResult(503, {
      error: "Chat is temporarily unavailable.",
      code: "CHAT_AGENT_UNAVAILABLE",
    });
  }
  const conversation = createdConversation.conversation;

  const senderName = frozenCustomerChatDisplayName({
    name: access.user.name,
    email: access.user.email,
  });

  const result = await sendConversationVoiceNote(
    deps.db as unknown as VoiceNoteSendDb,
    {
      workspaceId: ensured.workspaceId,
      leadId: ensured.leadId,
      conversationId: conversation.id,
      senderKind: "CUSTOMER",
      senderUserId: access.user.id,
      senderName,
      uploadId: multipart.uploadId ?? "",
      bytes: multipart.bytes,
      mimeType: multipart.mimeType,
      durationMs: multipart.durationMs,
      replyToMessageId: multipart.replyToMessageId,
    },
  );
  if (!result.ok) {
    return jsonResult(result.status, result.body);
  }

  await clearConversationTypingOnSend(
    deps.db as unknown as ConversationTypingDb,
    {
      workspaceId: ensured.workspaceId,
      conversationId: conversation.id,
      side: "customer",
    },
  ).catch(() => undefined);

  if (result.created) {
    try {
      await recordConversationLeadActivity(deps.db, {
        leadId: ensured.leadId,
        workspaceId: ensured.workspaceId,
        messageId: result.message.id,
        body: VOICE_NOTE_MESSAGE_BODY,
        channel: "CHAT",
        direction: "inbound",
        userId: access.user.id,
      });
    } catch {
      // persist already succeeded
    }
    try {
      (deps.scheduleAssignedAgentChatPush ??
        scheduleNotifyAssignedAgentOfCustomerChatMessage)({
        leadId: ensured.leadId,
        trustedWorkspaceId: ensured.workspaceId,
        created: true,
        message: {
          id: result.message.id,
          channel: result.message.channel,
          kind: result.message.kind,
          senderKind: result.message.senderKind,
          senderName: result.message.senderName,
          body: VOICE_NOTE_MESSAGE_BODY,
        },
      });
    } catch {
      // ignore
    }
  }

  const rich = await enrichChatMessages(
    deps.db as unknown as Parameters<typeof enrichChatMessages>[0],
    {
      workspaceId: ensured.workspaceId,
      conversationId: conversation.id,
      viewerUserId: access.user.id,
      messages: [
        {
          id: result.message.id,
          replyToMessageId: result.message.replyToMessageId,
          deliveredAt: result.message.deliveredAt,
        },
      ],
    },
  ).catch(() => new Map());
  const extras = rich.get(result.message.id);

  return jsonResult(200, {
    conversation: {
      id: conversation.id,
      status: conversation.status,
      lastMessageAt: result.message.createdAt.toISOString(),
    },
    message: presentCustomerConversationMessage(
      {
        id: result.message.id,
        channel: result.message.channel,
        kind: result.message.kind,
        senderKind: result.message.senderKind,
        senderName: result.message.senderName,
        body: result.message.body,
        editedAt: null,
        deletedAt: null,
        replyToMessageId: result.message.replyToMessageId,
        createdAt: result.message.createdAt,
        deliveredAt: result.message.deliveredAt,
        payload: result.message.payload,
      },
      {
        replyTo: extras?.replyTo ?? null,
        reactions: extras?.reactions ?? [],
        attachments: extras?.attachments?.length
          ? extras.attachments
          : [result.attachment],
      },
    ),
  });
}

export async function handleCustomerConversationVoiceAudioGet(
  request: Request,
  messageId: string,
  attachmentId: string,
  deps: CustomerConversationApiDeps,
): Promise<Response> {
  const requireSendAccess = deps.requireSendAccess ?? defaultRequireSendAccess;
  const access = await requireSendAccess();
  if (!access.ok) {
    return Response.json(access.body, { status: access.status });
  }
  if (!isConsumerRole(access.user.role)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const resolved = await (deps.resolveCustomerChatLead ??
    resolveCustomerChatLead)({
    request,
    untrustedClientHints: null,
    hostDeps: deps.hostDeps,
    deps: deps.resolverDeps,
  });
  if (!resolved.ok) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const conversation = await findLeadConversation(deps.db, {
    workspaceId: resolved.workspaceId,
    leadId: resolved.leadId,
  });
  if (!conversation) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const audio = await loadAuthorizedVoiceAttachmentAudio(
    deps.db as unknown as Parameters<
      typeof loadAuthorizedVoiceAttachmentAudio
    >[0],
    {
      workspaceId: resolved.workspaceId,
      conversationId: conversation.id,
      messageId,
      attachmentId,
    },
  );
  if (!audio.ok) {
    if (audio.reason === "STORAGE") {
      return Response.json({ error: "Audio unavailable" }, { status: 503 });
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return new Response(Buffer.from(audio.bytes), {
    status: 200,
    headers: {
      "Content-Type": audio.mimeType,
      "Cache-Control": "private, no-store",
      "Content-Length": String(audio.bytes.byteLength),
    },
  });
}
