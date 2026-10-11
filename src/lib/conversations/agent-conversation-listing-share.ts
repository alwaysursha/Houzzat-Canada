/**
 * Agent native CHAT LISTING_SHARE send (M4V).
 *
 * Idempotency: durable LeadActivity row + pg_advisory_xact_lock
 * (same pattern as call-outcome clientRequestId). No Message schema change.
 * Scope: workspaceId + conversationId + agentUserId + idempotencyKey.
 */

import { z } from "zod";
import type { AgentOrgContext } from "@/lib/agent";
import {
  clearConversationTypingOnSend,
  type ConversationTypingDb,
} from "@/lib/chat/typing/update";
import {
  loadAccessibleAgentConversationLead,
  type AgentConversationMessage,
} from "@/lib/conversations/agent-conversation-read";
import {
  presentSentMessage,
  type AgentConversationSendDb,
  type AgentChatSendPayload,
} from "@/lib/conversations/agent-conversation-send";
import { enrichChatMessages } from "@/lib/conversations/chat-rich-features";
import {
  CONVERSATION_MESSAGE_SELECT,
  type ConversationMessageDb,
  type ConversationMessageRecord,
} from "@/lib/conversations/create-conversation-message";
import {
  getOrCreateLeadConversation,
  LEAD_CONVERSATION_SELECT,
  type LeadConversationRecord,
} from "@/lib/conversations/lead-conversation";
import {
  LISTING_SHARE_MESSAGE_BODY,
  LISTING_SHARE_SOURCE_SELECT,
  buildListingShareSnapshot,
  parseListingShareClientRef,
  parseListingSharePayload,
  type ListingSharePayload,
  type ListingShareSourceListing,
} from "@/lib/conversations/listing-share";
import {
  recordConversationLeadActivity,
  type ConversationLeadActivityDb,
} from "@/lib/conversations/sms-lead-activity";
import {
  scheduleNotifyCustomerOfAgentChatMessage,
  type AgentChatCustomerPushDeps,
} from "@/lib/notifications/agent-chat-customer-push";
import type { WorkspaceListingEntitlement } from "@/lib/tenancy/listing-entitlement";

export const LISTING_SHARE_IDEMPOTENCY_ACTIVITY_TYPE =
  "CHAT_LISTING_SHARE" as const;

export const agentListingShareRequestSchema = z
  .object({
    mlsNumber: z.string().trim().min(1).max(32).optional(),
    listingId: z.string().trim().min(1).max(64).optional(),
    idempotencyKey: z.string().trim().min(8).max(128),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasMls = Boolean(value.mlsNumber?.trim());
    const hasId = Boolean(value.listingId?.trim());
    if (hasMls === hasId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one of mlsNumber or listingId",
      });
    }
  });

export type AgentListingShareRequest = z.infer<
  typeof agentListingShareRequestSchema
>;

// Omit ConversationMessageDb.$transaction so the callback tx is AgentListingShareTx
// (with $executeRaw for pg_advisory_xact_lock), not the narrower ConversationMessageTx.
export type AgentListingShareDb = Omit<
  AgentConversationSendDb & ConversationLeadActivityDb & ConversationMessageDb,
  "$transaction" | "$executeRaw"
> & {
  listing: {
    findUnique: (args: Record<string, unknown>) => Promise<
      | (ListingShareSourceListing & {
          media?: Array<{ url: string; isPrimary: boolean; sortOrder: number }>;
        })
      | null
    >;
  };
  message: ConversationMessageDb["message"] & {
    findUnique: (
      args: Record<string, unknown>,
    ) => Promise<ConversationMessageRecord | null>;
  };
  leadActivity: ConversationLeadActivityDb["leadActivity"] & {
    findFirst: (args: Record<string, unknown>) => Promise<{
      id: string;
      meta: unknown;
    } | null>;
    create: (args: Record<string, unknown>) => Promise<{ id: string }>;
  };
  $executeRaw: (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown>;
  $transaction: <T>(
    fn: (tx: AgentListingShareTx) => Promise<T>,
  ) => Promise<T>;
};

export type AgentListingShareTx = {
  $executeRaw: AgentListingShareDb["$executeRaw"];
  message: AgentListingShareDb["message"];
  conversation: {
    update: (args: Record<string, unknown>) => Promise<LeadConversationRecord>;
  };
  leadActivity: AgentListingShareDb["leadActivity"];
};

export type SendAgentLeadListingShareDeps = {
  entitlement: WorkspaceListingEntitlement;
  now?: Date;
  entitlementFilteringEnabled?: boolean;
  scheduleCustomerPush?: (
    input: Parameters<typeof scheduleNotifyCustomerOfAgentChatMessage>[0],
    deps?: AgentChatCustomerPushDeps,
  ) => void;
};

export type SendAgentLeadListingShareResult =
  | {
      ok: true;
      data: AgentChatSendPayload & { replayed: boolean };
    }
  | {
      ok: false;
      reason:
        | "LEAD_NOT_FOUND"
        | "FORBIDDEN"
        | "INVALID_BODY"
        | "LISTING_NOT_FOUND"
        | "LISTING_FORBIDDEN"
        | "IDEMPOTENCY_CONFLICT"
        | "CONVERSATION_FAILED";
    };

type IdempotencyMeta = {
  idempotencyKey: string;
  workspaceId: string;
  conversationId: string;
  agentUserId: string;
  messageId: string;
  listingId: string;
  mlsNumber: string;
};

function readIdempotencyMeta(raw: unknown): IdempotencyMeta | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (
    typeof row.idempotencyKey !== "string" ||
    typeof row.workspaceId !== "string" ||
    typeof row.conversationId !== "string" ||
    typeof row.agentUserId !== "string" ||
    typeof row.messageId !== "string" ||
    typeof row.listingId !== "string" ||
    typeof row.mlsNumber !== "string"
  ) {
    return null;
  }
  return {
    idempotencyKey: row.idempotencyKey,
    workspaceId: row.workspaceId,
    conversationId: row.conversationId,
    agentUserId: row.agentUserId,
    messageId: row.messageId,
    listingId: row.listingId,
    mlsNumber: row.mlsNumber,
  };
}

function primaryMediaUrl(
  media: Array<{ url: string; isPrimary: boolean; sortOrder: number }> | undefined,
): string | null {
  if (!media?.length) return null;
  const primary =
    media.find((row) => row.isPrimary) ??
    [...media].sort((a, b) => a.sortOrder - b.sortOrder)[0];
  return primary?.url ?? null;
}

async function loadListingForShare(
  db: AgentListingShareDb,
  ref: { mlsNumber?: string; listingId?: string },
): Promise<{
  listing: ListingShareSourceListing;
  primaryMediaUrl: string | null;
} | null> {
  const listing = ref.listingId
    ? await db.listing.findUnique({
        where: { id: ref.listingId },
        select: {
          ...LISTING_SHARE_SOURCE_SELECT,
          media: {
            select: { url: true, isPrimary: true, sortOrder: true },
            orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
            take: 3,
          },
        },
      })
    : await db.listing.findUnique({
        where: { mlsNumber: ref.mlsNumber!.toUpperCase() },
        select: {
          ...LISTING_SHARE_SOURCE_SELECT,
          media: {
            select: { url: true, isPrimary: true, sortOrder: true },
            orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
            take: 3,
          },
        },
      });
  if (!listing) return null;
  const { media, ...rest } = listing as ListingShareSourceListing & {
    media?: Array<{ url: string; isPrimary: boolean; sortOrder: number }>;
  };
  return {
    listing: rest,
    primaryMediaUrl: primaryMediaUrl(media),
  };
}

function listingIdentityMatches(
  payload: ListingSharePayload,
  listing: ListingShareSourceListing,
): boolean {
  return (
    payload.listingId === listing.id &&
    payload.mlsNumber === listing.mlsNumber.trim().toUpperCase()
  );
}

export async function sendAgentLeadListingShare(
  db: AgentListingShareDb,
  ctx: AgentOrgContext,
  leadId: string,
  request: AgentListingShareRequest,
  deps: SendAgentLeadListingShareDeps,
): Promise<SendAgentLeadListingShareResult> {
  const refParsed = parseListingShareClientRef(
    request.mlsNumber
      ? { mlsNumber: request.mlsNumber }
      : { listingId: request.listingId! },
  );
  if (!refParsed.ok) return { ok: false, reason: "INVALID_BODY" };
  const idempotencyKey = request.idempotencyKey.trim();
  if (idempotencyKey.length < 8) {
    return { ok: false, reason: "INVALID_BODY" };
  }

  const senderName =
    ctx.user.name?.trim() || ctx.user.email?.trim() || "";
  if (!senderName) return { ok: false, reason: "INVALID_BODY" };

  const lead = await loadAccessibleAgentConversationLead(db, ctx, leadId);
  // Narrow once — TS does not preserve property narrowing inside $transaction.
  const workspaceId = lead?.workspaceId?.trim() || "";
  if (!lead || !workspaceId) {
    return { ok: false, reason: "LEAD_NOT_FOUND" };
  }
  if (!lead.assignedAgentId || lead.assignedAgentId !== ctx.user.id) {
    return { ok: false, reason: "FORBIDDEN" };
  }
  if (deps.entitlement.workspaceId !== workspaceId) {
    return { ok: false, reason: "LISTING_FORBIDDEN" };
  }

  const conversationResult = await getOrCreateLeadConversation(db, {
    workspaceId,
    leadId: lead.id,
  });
  if (!conversationResult.ok) {
    return { ok: false, reason: "CONVERSATION_FAILED" };
  }
  const conversation = conversationResult.conversation;

  const loaded = await loadListingForShare(db, refParsed.ref);
  if (!loaded) return { ok: false, reason: "LISTING_NOT_FOUND" };

  const snapshot = buildListingShareSnapshot({
    entitlement: deps.entitlement,
    trustedWorkspaceId: workspaceId,
    listing: loaded.listing,
    primaryMediaUrl: loaded.primaryMediaUrl,
    now: deps.now,
    entitlementFilteringEnabled: deps.entitlementFilteringEnabled ?? true,
  });
  if (!snapshot.ok) {
    return { ok: false, reason: "LISTING_FORBIDDEN" };
  }

  const lockWorkspaceConversation = `${workspaceId}:${conversation.id}`;
  const lockAgentKey = `${ctx.user.id}:${idempotencyKey}`;

  type TxResult =
    | {
        kind: "created";
        message: ConversationMessageRecord;
        conversation: LeadConversationRecord;
      }
    | {
        kind: "replayed";
        message: ConversationMessageRecord;
        conversation: LeadConversationRecord;
      }
    | { kind: "conflict" }
    | { kind: "failed" };

  let txResult: TxResult;
  try {
    txResult = await db.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtext(${lockWorkspaceConversation}),
          hashtext(${lockAgentKey})
        )
      `;

      const existing = await tx.leadActivity.findFirst({
        where: {
          leadId: lead.id,
          type: LISTING_SHARE_IDEMPOTENCY_ACTIVITY_TYPE,
          userId: ctx.user.id,
          meta: { path: ["idempotencyKey"], equals: idempotencyKey },
        },
        select: { id: true, meta: true },
      });
      if (existing) {
        const meta = readIdempotencyMeta(existing.meta);
        if (
          !meta ||
          meta.workspaceId !== workspaceId ||
          meta.conversationId !== conversation.id ||
          meta.agentUserId !== ctx.user.id
        ) {
          return { kind: "conflict" as const };
        }
        if (
          meta.listingId !== snapshot.payload.listingId ||
          meta.mlsNumber !== snapshot.payload.mlsNumber
        ) {
          return { kind: "conflict" as const };
        }
        const message = await tx.message.findUnique({
          where: {
            workspaceId_id: {
              workspaceId,
              id: meta.messageId,
            },
          },
          select: CONVERSATION_MESSAGE_SELECT,
        });
        if (!message) return { kind: "failed" as const };
        const parsed = parseListingSharePayload(message.payload);
        if (!parsed.ok || !listingIdentityMatches(parsed.payload, loaded.listing)) {
          return { kind: "conflict" as const };
        }
        return {
          kind: "replayed" as const,
          message,
          conversation,
        };
      }

      // Persist inside the same locked transaction (no nested createConversationMessage).
      // Content already validated by buildListingShareSnapshot + parseListingSharePayload.
      const createdAt = deps.now ?? new Date();
      const message = await tx.message.create({
        data: {
          workspaceId,
          conversationId: conversation.id,
          leadId: lead.id,
          channel: "CHAT",
          kind: "TEXT",
          senderKind: "AGENT",
          senderUserId: ctx.user.id,
          createdByUserId: ctx.user.id,
          senderName,
          body: LISTING_SHARE_MESSAGE_BODY,
          createdAt,
          payload: snapshot.payload,
        },
        select: CONVERSATION_MESSAGE_SELECT,
      });
      const updatedConversation = await tx.conversation.update({
        where: {
          workspaceId_id: {
            workspaceId,
            id: conversation.id,
          },
        },
        data: { lastMessageAt: message.createdAt },
        select: LEAD_CONVERSATION_SELECT,
      });

      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          userId: ctx.user.id,
          type: LISTING_SHARE_IDEMPOTENCY_ACTIVITY_TYPE,
          body: LISTING_SHARE_MESSAGE_BODY,
          meta: {
            idempotencyKey,
            workspaceId,
            conversationId: updatedConversation.id,
            agentUserId: ctx.user.id,
            messageId: message.id,
            listingId: snapshot.payload.listingId,
            mlsNumber: snapshot.payload.mlsNumber,
          } satisfies IdempotencyMeta,
        },
      });

      return {
        kind: "created" as const,
        message,
        conversation: updatedConversation,
      };
    });
  } catch {
    return { ok: false, reason: "CONVERSATION_FAILED" };
  }

  if (txResult.kind === "conflict") {
    return { ok: false, reason: "IDEMPOTENCY_CONFLICT" };
  }
  if (txResult.kind === "failed") {
    return { ok: false, reason: "CONVERSATION_FAILED" };
  }

  const replayed = txResult.kind === "replayed";
  const message = txResult.message;
  const conversationOut = txResult.conversation;

  if (!replayed) {
    await clearConversationTypingOnSend(db as unknown as ConversationTypingDb, {
      workspaceId,
      conversationId: conversationOut.id,
      side: "agent",
    }).catch(() => undefined);

    try {
      await recordConversationLeadActivity(db, {
        leadId: lead.id,
        workspaceId,
        messageId: message.id,
        body: LISTING_SHARE_MESSAGE_BODY,
        channel: "CHAT",
        direction: "outbound",
        userId: ctx.user.id,
      });
    } catch {
      // Message already persisted.
    }

    try {
      const schedule =
        deps.scheduleCustomerPush ?? scheduleNotifyCustomerOfAgentChatMessage;
      schedule({
        leadId: lead.id,
        trustedWorkspaceId: workspaceId,
        created: true,
        message: {
          id: message.id,
          channel: message.channel,
          kind: message.kind,
          senderKind: message.senderKind,
          senderName: message.senderName,
          body: LISTING_SHARE_MESSAGE_BODY,
        },
      });
    } catch {
      // Chat persist already succeeded.
    }
  }

  const rich = await enrichChatMessages(
    db as unknown as Parameters<typeof enrichChatMessages>[0],
    {
      workspaceId,
      conversationId: conversationOut.id,
      viewerUserId: ctx.user.id,
      messages: [
        {
          id: message.id,
          replyToMessageId: message.replyToMessageId,
          deliveredAt: message.deliveredAt,
        },
      ],
    },
  ).catch(() => new Map());
  const extras = rich.get(message.id);
  const presented = presentSentMessage(message);

  return {
    ok: true,
    data: {
      replayed,
      conversation: {
        id: conversationOut.id,
        leadId: conversationOut.leadId,
        lastMessageAt: conversationOut.lastMessageAt
          ? conversationOut.lastMessageAt.toISOString()
          : null,
        created: conversationResult.created,
      },
      message: {
        ...presented,
        replyTo: extras?.replyTo ?? presented.replyTo,
        reactions: extras?.reactions ?? presented.reactions,
      } as AgentConversationMessage,
    },
  };
}
