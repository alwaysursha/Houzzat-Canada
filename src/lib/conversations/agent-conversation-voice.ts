/**
 * Agent voice-note upload + authorized audio playback.
 */

import type { AgentOrgContext } from "@/lib/agent";
import { VOICE_NOTE_MESSAGE_BODY } from "@/lib/chat/voice-notes/constants";
import {
  loadAuthorizedVoiceAttachmentAudio,
  type VoiceAttachmentLookupDb,
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
  frozenAgentSenderName,
  presentSentMessage,
  type AgentConversationSendDb,
} from "@/lib/conversations/agent-conversation-send";
import {
  loadAccessibleAgentConversationLead,
  presentAgentConversationMessage,
  type AgentConversationMessage,
} from "@/lib/conversations/agent-conversation-read";
import {
  findLeadConversation,
  getOrCreateLeadConversation,
} from "@/lib/conversations/lead-conversation";
import { recordConversationLeadActivity } from "@/lib/conversations/sms-lead-activity";
import {
  scheduleNotifyCustomerOfAgentChatMessage,
} from "@/lib/notifications/agent-chat-customer-push";

export async function sendAgentLeadVoiceNote(
  db: AgentConversationSendDb & VoiceNoteSendDb,
  ctx: AgentOrgContext,
  leadId: string,
  request: Request,
): Promise<
  | { ok: true; data: { message: AgentConversationMessage } }
  | { ok: false; status: number; body: unknown }
> {
  const multipart = await readVoiceNoteMultipart(request);
  if (!multipart.ok) {
    return { ok: false, status: 400, body: { error: multipart.error } };
  }

  const lead = await loadAccessibleAgentConversationLead(db, ctx, leadId);
  if (!lead?.workspaceId) {
    return { ok: false, status: 404, body: { error: "Not found" } };
  }
  if (!lead.assignedAgentId || lead.assignedAgentId !== ctx.user.id) {
    return { ok: false, status: 403, body: { error: "Forbidden" } };
  }

  const existing = await findLeadConversation(db, {
    workspaceId: lead.workspaceId,
    leadId: lead.id,
  });
  const createdConversation = existing
    ? { ok: true as const, conversation: existing }
    : await getOrCreateLeadConversation(db, {
        workspaceId: lead.workspaceId,
        leadId: lead.id,
      });
  if (!createdConversation.ok) {
    return { ok: false, status: 404, body: { error: "Not found" } };
  }
  const conversation = createdConversation.conversation;

  const senderName = frozenAgentSenderName(ctx.user);
  if (!senderName) {
    return { ok: false, status: 400, body: { error: "Invalid payload" } };
  }

  const result = await sendConversationVoiceNote(db, {
    workspaceId: lead.workspaceId,
    leadId: lead.id,
    conversationId: conversation.id,
    senderKind: "AGENT",
    senderUserId: ctx.user.id,
    senderName,
    uploadId: multipart.uploadId ?? "",
    bytes: multipart.bytes,
    mimeType: multipart.mimeType,
    durationMs: multipart.durationMs,
    replyToMessageId: multipart.replyToMessageId,
  });
  if (!result.ok) {
    return { ok: false, status: result.status, body: result.body };
  }

  if (result.created) {
    try {
      await recordConversationLeadActivity(db, {
        leadId: lead.id,
        workspaceId: lead.workspaceId,
        messageId: result.message.id,
        body: VOICE_NOTE_MESSAGE_BODY,
        channel: "CHAT",
        direction: "outbound",
        userId: ctx.user.id,
      });
    } catch {
      // ignore
    }
    try {
      scheduleNotifyCustomerOfAgentChatMessage({
        leadId: lead.id,
        trustedWorkspaceId: lead.workspaceId,
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
    db as unknown as Parameters<typeof enrichChatMessages>[0],
    {
      workspaceId: lead.workspaceId,
      conversationId: conversation.id,
      viewerUserId: ctx.user.id,
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
  const presented = presentSentMessage(result.message);

  return {
    ok: true,
    data: {
      message: presentAgentConversationMessage(
        {
          id: result.message.id,
          channel: result.message.channel,
          kind: result.message.kind,
          senderKind: result.message.senderKind,
          senderUserId: result.message.senderUserId,
          senderName: result.message.senderName,
          body: result.message.body,
          editedAt: null,
          deletedAt: null,
          replyToMessageId: result.message.replyToMessageId,
          createdAt: result.message.createdAt,
          deliveredAt: result.message.deliveredAt,
          smsSource: result.message.smsSource,
          providerStatus: result.message.providerStatus,
          payload: result.message.payload,
        },
        {
          replyTo: extras?.replyTo ?? presented.replyTo,
          reactions: extras?.reactions ?? [],
          attachments: extras?.attachments?.length
            ? extras.attachments
            : [result.attachment],
        },
      ),
    },
  };
}

export async function loadAgentLeadVoiceAttachmentAudio(
  db: AgentConversationSendDb & VoiceNoteSendDb & VoiceAttachmentLookupDb,
  ctx: AgentOrgContext,
  leadId: string,
  messageId: string,
  attachmentId: string,
): Promise<Response> {
  const lead = await loadAccessibleAgentConversationLead(db, ctx, leadId);
  if (!lead?.workspaceId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const conversation = await findLeadConversation(db, {
    workspaceId: lead.workspaceId,
    leadId: lead.id,
  });
  if (!conversation) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const audio = await loadAuthorizedVoiceAttachmentAudio(db, {
    workspaceId: lead.workspaceId,
    conversationId: conversation.id,
    messageId,
    attachmentId,
  });
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
