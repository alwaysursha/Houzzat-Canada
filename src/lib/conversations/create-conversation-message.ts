/**
 * Canonical HouzzatPRO Conversation Message insert.
 *
 * AUTHORIZATION BOUNDARY
 * This module is tenant-safe persistence, not request authorization.
 * Callers MUST authorize first (Agent canAccessLead / v2CanAccessLead /
 * mobile token.wsId, or consumer Lead ownership), then pass trusted
 * workspaceId + leadId. Do not infer the sender from Lead.assignedAgentId.
 *
 * Transcript source of truth is Conversation/Message. Do not write
 * LeadActivity or send notifications from this layer.
 *
 * Atomicity: getOrCreateLeadConversation runs first (HTTP-safe, no tx).
 * Then Message insert + Conversation.lastMessageAt run in db.$transaction.
 * On Cloudflare Workers, `@/lib/prisma` `$transaction` uses a one-shot
 * WebSocket client (Neon HTTP cannot BEGIN/COMMIT).
 */
import type {
  Message,
  MessageChannel,
  MessageKind,
  MessageSenderKind,
  MessageSmsSource,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import {
  getOrCreateLeadConversation,
  LEAD_CONVERSATION_SELECT,
  type LeadConversationDb,
  type LeadConversationRecord,
} from "@/lib/conversations/lead-conversation";
import { parseListingSharePayload } from "@/lib/conversations/listing-share/payload";
import {
  isSmsAutomationTextPayload,
} from "@/lib/conversations/sms-automation-payload";
import { smsAutomationKeyFromPayload } from "@/lib/platform/sms-automations/catalog";

export const SYSTEM_SENDER_NAME = "Houzzat";

export const SYSTEM_CARD_TYPES = [
  "ASSIGNED",
  "REASSIGNED",
  "VIEWING_CONFIRMED",
] as const;

export type SystemCardType = (typeof SYSTEM_CARD_TYPES)[number];

export const CONVERSATION_MESSAGE_SELECT = {
  id: true,
  workspaceId: true,
  conversationId: true,
  leadId: true,
  channel: true,
  kind: true,
  senderKind: true,
  senderUserId: true,
  senderName: true,
  createdByUserId: true,
  body: true,
  replyToMessageId: true,
  createdAt: true,
  deliveredAt: true,
  smsSource: true,
  twilioMessageSid: true,
  providerStatus: true,
  smsFrom: true,
  smsTo: true,
  payload: true,
} as const;

export type ConversationMessageRecord = Pick<
  Message,
  keyof typeof CONVERSATION_MESSAGE_SELECT
>;

export type ConversationMessageTx = {
  message: Pick<PrismaClient["message"], "create">;
  conversation: Pick<PrismaClient["conversation"], "update">;
};

export type ConversationMessageDb = LeadConversationDb & {
  message: Pick<
    PrismaClient["message"],
    "findUnique" | "findFirst" | "create"
  >;
  conversation: Pick<
    PrismaClient["conversation"],
    "findUnique" | "create" | "update"
  >;
  $transaction: <T>(
    fn: (tx: ConversationMessageTx) => Promise<T>,
  ) => Promise<T>;
};

export type CreateConversationMessageInput = {
  workspaceId: string;
  leadId: string;
  channel: MessageChannel;
  kind: MessageKind;
  senderKind: MessageSenderKind;
  senderUserId?: string | null;
  senderName: string;
  createdByUserId?: string | null;
  body?: string | null;
  replyToMessageId?: string | null;
  payload?: Prisma.InputJsonValue | null;
  smsSource?: MessageSmsSource | null;
  twilioMessageSid?: string | null;
  smsFrom?: string | null;
  smsTo?: string | null;
  providerStatus?: string | null;
};

export type CreateConversationMessageReason =
  | "INVALID_INPUT"
  | "LEAD_NOT_IN_WORKSPACE"
  | "INVALID_SENDER"
  | "INVALID_CONTENT"
  | "INVALID_CHANNEL"
  | "INVALID_REPLY"
  | "TWILIO_SID_CONFLICT";

export type CreateConversationMessageResult =
  | {
      ok: true;
      created: boolean;
      conversationCreated: boolean;
      message: ConversationMessageRecord;
      conversation: LeadConversationRecord;
    }
  | {
      ok: false;
      reason: CreateConversationMessageReason;
    };

type NormalizedMessage = {
  ok: true;
  channel: MessageChannel;
  kind: MessageKind;
  senderKind: MessageSenderKind;
  senderUserId: string | null;
  senderName: string;
  createdByUserId: string | null;
  body: string | null;
  payload: Prisma.InputJsonValue | null;
  smsSource: MessageSmsSource | null;
  twilioMessageSid: string | null;
  smsFrom: string | null;
  smsTo: string | null;
  providerStatus: string | null;
};

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function isSystemCardType(value: string): value is SystemCardType {
  return (SYSTEM_CARD_TYPES as readonly string[]).includes(value);
}

function payloadCardType(
  payload: Prisma.InputJsonValue | null,
): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const card = (payload as { card?: unknown }).card;
  return typeof card === "string" && card.trim() ? card.trim() : null;
}

function normalizeSender(
  input: CreateConversationMessageInput,
):
  | { ok: true; senderUserId: string | null; senderName: string; createdByUserId: string | null }
  | { ok: false } {
  const senderName = input.senderName.trim();
  const senderUserId = emptyToNull(input.senderUserId);
  const createdByUserId = emptyToNull(input.createdByUserId);

  switch (input.senderKind) {
    case "AGENT":
    case "ADMIN":
      if (!senderUserId || !senderName) return { ok: false };
      return { ok: true, senderUserId, senderName, createdByUserId };
    case "CUSTOMER":
      if (!senderName) return { ok: false };
      return { ok: true, senderUserId, senderName, createdByUserId };
    case "SYSTEM":
      if (senderUserId || createdByUserId) return { ok: false };
      if (senderName !== SYSTEM_SENDER_NAME) return { ok: false };
      return {
        ok: true,
        senderUserId: null,
        senderName: SYSTEM_SENDER_NAME,
        createdByUserId: null,
      };
    default:
      return { ok: false };
  }
}

function normalizeChannel(
  input: CreateConversationMessageInput,
):
  | {
      ok: true;
      smsSource: MessageSmsSource | null;
      twilioMessageSid: string | null;
      smsFrom: string | null;
      smsTo: string | null;
      providerStatus: string | null;
    }
  | { ok: false } {
  const smsSource = input.smsSource ?? null;
  const twilioMessageSid = emptyToNull(input.twilioMessageSid);
  const smsFrom = emptyToNull(input.smsFrom);
  const smsTo = emptyToNull(input.smsTo);
  const providerStatus = emptyToNull(input.providerStatus);

  if (input.channel === "CHAT") {
    if (smsSource || twilioMessageSid || smsFrom || smsTo || providerStatus) {
      return { ok: false };
    }
    return {
      ok: true,
      smsSource: null,
      twilioMessageSid: null,
      smsFrom: null,
      smsTo: null,
      providerStatus: null,
    };
  }

  if (input.channel === "SMS") {
    if (input.kind === "SYSTEM_CARD") return { ok: false };
    if (smsSource === "TWILIO") {
      if (!twilioMessageSid || !smsFrom || !smsTo) return { ok: false };
      return {
        ok: true,
        smsSource: "TWILIO",
        twilioMessageSid,
        smsFrom,
        smsTo,
        providerStatus,
      };
    }
    if (smsSource === "MANUAL") {
      if (twilioMessageSid) return { ok: false };
      return {
        ok: true,
        smsSource: "MANUAL",
        twilioMessageSid: null,
        smsFrom,
        smsTo,
        providerStatus,
      };
    }
    return { ok: false };
  }

  return { ok: false };
}

function normalizeContent(
  input: CreateConversationMessageInput,
):
  | { ok: true; body: string | null; payload: Prisma.InputJsonValue | null }
  | { ok: false } {
  const body = emptyToNull(input.body);
  const payload = input.payload ?? null;

  if (input.kind === "TEXT") {
    if (!body) return { ok: false };
    if (payload == null) return { ok: true, body, payload: null };
    // CHAT: only trusted LISTING_SHARE snapshots (server-built). Never SMS automation.
    if (input.channel === "CHAT") {
      const share = parseListingSharePayload(payload);
      if (!share.ok) return { ok: false };
      return {
        ok: true,
        body,
        payload: share.payload as Prisma.InputJsonValue,
      };
    }
    // SMS: automation key payload only (existing).
    if (input.channel !== "SMS" || !isSmsAutomationTextPayload(payload)) {
      return { ok: false };
    }
    const automationKey = smsAutomationKeyFromPayload(payload);
    if (!automationKey) return { ok: false };
    return { ok: true, body, payload: { automationKey } };
  }

  if (input.kind === "SYSTEM_CARD") {
    const card = payloadCardType(payload);
    if (!card || !isSystemCardType(card)) return { ok: false };
    return { ok: true, body, payload };
  }

  return { ok: false };
}

function normalizeInput(
  input: CreateConversationMessageInput,
): NormalizedMessage | { ok: false; reason: CreateConversationMessageReason } {
  const workspaceId = input.workspaceId.trim();
  const leadId = input.leadId.trim();
  if (!workspaceId || !leadId) {
    return { ok: false, reason: "INVALID_INPUT" };
  }

  const sender = normalizeSender(input);
  if (!sender.ok) return { ok: false, reason: "INVALID_SENDER" };

  const channel = normalizeChannel(input);
  if (!channel.ok) return { ok: false, reason: "INVALID_CHANNEL" };

  const content = normalizeContent(input);
  if (!content.ok) return { ok: false, reason: "INVALID_CONTENT" };

  return {
    ok: true,
    channel: input.channel,
    kind: input.kind,
    senderKind: input.senderKind,
    senderUserId: sender.senderUserId,
    senderName: sender.senderName,
    createdByUserId: sender.createdByUserId,
    body: content.body,
    payload: content.payload,
    smsSource: channel.smsSource,
    twilioMessageSid: channel.twilioMessageSid,
    smsFrom: channel.smsFrom,
    smsTo: channel.smsTo,
    providerStatus: channel.providerStatus,
  };
}

async function findMessageByTwilioSid(
  db: ConversationMessageDb,
  twilioMessageSid: string,
): Promise<ConversationMessageRecord | null> {
  return db.message.findUnique({
    where: { twilioMessageSid },
    select: CONVERSATION_MESSAGE_SELECT,
  });
}

function sidMatchesConversation(
  message: ConversationMessageRecord,
  conversation: LeadConversationRecord,
): boolean {
  return (
    message.workspaceId === conversation.workspaceId &&
    message.conversationId === conversation.id &&
    message.leadId === conversation.leadId
  );
}

/**
 * Insert one Message into the Lead's permanent Conversation.
 * Lazily creates the Conversation. Does not authorize the caller.
 */
export async function createConversationMessage(
  db: ConversationMessageDb,
  input: CreateConversationMessageInput,
): Promise<CreateConversationMessageResult> {
  const normalized = normalizeInput(input);
  if (!normalized.ok) {
    return normalized;
  }

  const ids = {
    workspaceId: input.workspaceId.trim(),
    leadId: input.leadId.trim(),
  };

  const conversationResult = await getOrCreateLeadConversation(db, ids);
  if (!conversationResult.ok) {
    return conversationResult;
  }

  const conversation = conversationResult.conversation;

  const replyToMessageId = emptyToNull(input.replyToMessageId);
  if (replyToMessageId) {
    const replyTarget = await db.message.findFirst({
      where: {
        id: replyToMessageId,
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
      },
      select: { id: true },
    });
    if (!replyTarget) {
      return { ok: false, reason: "INVALID_REPLY" };
    }
  }

  if (normalized.twilioMessageSid) {
    const existingSid = await findMessageByTwilioSid(
      db,
      normalized.twilioMessageSid,
    );
    if (existingSid) {
      if (!sidMatchesConversation(existingSid, conversation)) {
        return { ok: false, reason: "TWILIO_SID_CONFLICT" };
      }
      return {
        ok: true,
        created: false,
        conversationCreated: conversationResult.created,
        message: existingSid,
        conversation,
      };
    }
  }

  const createdAt = new Date();
  const data: Prisma.MessageUncheckedCreateInput = {
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    leadId: conversation.leadId,
    channel: normalized.channel,
    kind: normalized.kind,
    senderKind: normalized.senderKind,
    senderUserId: normalized.senderUserId,
    senderName: normalized.senderName,
    createdByUserId: normalized.createdByUserId,
    body: normalized.body,
    replyToMessageId,
    createdAt,
    smsSource: normalized.smsSource,
    twilioMessageSid: normalized.twilioMessageSid,
    providerStatus: normalized.providerStatus,
    smsFrom: normalized.smsFrom,
    smsTo: normalized.smsTo,
    payload: normalized.payload ?? undefined,
  };

  try {
    const persisted = await db.$transaction(async (tx) => {
      const message = await tx.message.create({
        data,
        select: CONVERSATION_MESSAGE_SELECT,
      });
      const updated = await tx.conversation.update({
        where: {
          workspaceId_id: {
            workspaceId: conversation.workspaceId,
            id: conversation.id,
          },
        },
        data: { lastMessageAt: message.createdAt },
        select: LEAD_CONVERSATION_SELECT,
      });
      return { message, conversation: updated };
    });

    return {
      ok: true,
      created: true,
      conversationCreated: conversationResult.created,
      message: persisted.message,
      conversation: persisted.conversation,
    };
  } catch (error) {
    if (!isUniqueConstraintError(error) || !normalized.twilioMessageSid) {
      throw error;
    }
    const raced = await findMessageByTwilioSid(db, normalized.twilioMessageSid);
    if (raced && sidMatchesConversation(raced, conversation)) {
      return {
        ok: true,
        created: false,
        conversationCreated: conversationResult.created,
        message: raced,
        conversation,
      };
    }
    return { ok: false, reason: "TWILIO_SID_CONFLICT" };
  }
}
