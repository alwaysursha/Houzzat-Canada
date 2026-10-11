/**
 * Agent unread-reminder cron runner (Chat V1 / M4S).
 *
 * Discovers a fair bounded candidate batch, claims via M4R
 * (interactive txn + locks), then awaits FCM via deliverPushToUsersNow.
 * Claim-before-send = at-most-once attempt; delivery counted only on
 * push helper status "sent".
 *
 * Requires Node (or workerd $transaction → one-shot Neon WS). Do not run
 * with PRISMA_NEON_ADAPTER=http on Node — interactive locks will fail.
 */

import { chatsPageHref } from "@/lib/agent/chats-inbox-query";
import {
  AGENT_UNREAD_REMINDER_DELAY_MS,
  claimAgentUnreadReminder,
  isLikelyAgentUnreadReminderCandidate,
  type AgentUnreadReminderClaim,
  type AgentUnreadReminderConversationRow,
  type AgentUnreadReminderDb,
  type AgentUnreadReminderSkipReason,
} from "@/lib/conversations/agent-unread-reminder";
import { CUSTOMER_CHAT_PUSH_TYPE } from "@/lib/notifications/customer-chat-agent-push";
import { isPushTypeEnabled } from "@/lib/notifications/catalog";
import {
  deliverPushToUsersNow,
  type PushDeliveryResult,
  type PushPayload,
} from "@/lib/notifications/push";
import { authorizeStaffRecipientForLead } from "@/lib/workspace-notification-recipients";

export const CHAT_UNREAD_REMINDER_CRON = {
  job: "chat-unread-reminders",
  /** Documented intent only — no LaunchAgent / Vercel schedule in M4S. */
  schedule: "unscheduled (manual / future LaunchAgent)",
} as const;

/** Secret auth shared by the cron route (Bearer or x-*-cron-secret headers). */
export function authorizeChatUnreadReminderCronRequest(
  request: Request,
): boolean {
  const secret =
    process.env.CHAT_UNREAD_REMINDER_CRON_SECRET?.trim() ||
    process.env.MONITOR_CRON_SECRET?.trim() ||
    process.env.DIGEST_CRON_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("x-chat-unread-reminder-cron-secret");
  const monitorHeader = request.headers.get("x-monitor-cron-secret");
  const digestHeader = request.headers.get("x-digest-cron-secret");
  const auth = request.headers.get("authorization");
  if (header && header === secret) return true;
  if (monitorHeader && monitorHeader === secret) return true;
  if (digestHeader && digestHeader === secret) return true;
  if (auth === `Bearer ${secret}`) return true;
  return false;
}

/** Max conversations claimed+pushed per cron invocation. */
export const CHAT_UNREAD_REMINDER_CRON_BATCH = 40;
/** Soft scan cap before stopping candidate discovery. */
export const CHAT_UNREAD_REMINDER_CRON_SCAN = 200;
/** Per-workspace cap inside one run so busy tenants cannot starve others. */
export const CHAT_UNREAD_REMINDER_CRON_PER_WORKSPACE = 5;

export const CHAT_UNREAD_REMINDER_PUSH_TITLE = "Unread message";
export const CHAT_UNREAD_REMINDER_PUSH_BODY =
  "You have an unread customer message.";

const ID_PREFIX_LEN = 8;

export type ChatUnreadReminderCandidate = {
  id: string;
  workspaceId: string;
  leadId: string;
  status: string;
  lastMessageAt: Date | null;
  agentUnreadReminderMessageId: string | null;
  agentUnreadReminderAgentId: string | null;
  assignedAgentId: string | null;
};

export type ChatUnreadReminderCronSummary = {
  job: typeof CHAT_UNREAD_REMINDER_CRON.job;
  candidatesScanned: number;
  eligibleClaims: number;
  remindersAttempted: number;
  remindersSent: number;
  skipped: number;
  errors: number;
};

export type ChatUnreadReminderCronDb = AgentUnreadReminderDb & {
  $queryRaw: <T = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<T>;
};

export type ChatUnreadReminderPrePushSnapshot = {
  assignedAgentId: string | null;
  agentLastReadAt: Date | null;
  agentLastReadByUserId: string | null;
  agentUnreadReminderMessageId: string | null;
  agentUnreadReminderAgentId: string | null;
  disabledAt: Date | null;
  pushNotificationPrefs: unknown;
  conversationStatus: string;
};

export type ChatUnreadReminderCronDeps = {
  db: ChatUnreadReminderCronDb;
  now?: Date;
  batch?: number;
  scan?: number;
  perWorkspace?: number;
  claimAgentUnreadReminder?: typeof claimAgentUnreadReminder;
  deliverPushToUsersNow?: typeof deliverPushToUsersNow;
  authorizeStaffRecipientForLead?: typeof authorizeStaffRecipientForLead;
  loadPrePushSnapshot?: (
    db: ChatUnreadReminderCronDb,
    claim: AgentUnreadReminderClaim,
  ) => Promise<ChatUnreadReminderPrePushSnapshot | null>;
};

export type ChatUnreadReminderAbortReason =
  | AgentUnreadReminderSkipReason
  | "PRE_PUSH_ASSIGNMENT_CHANGED"
  | "PRE_PUSH_CURSOR_CHANGED"
  | "PRE_PUSH_PREFERENCE_OFF"
  | "PRE_PUSH_AGENT_INELIGIBLE"
  | "PRE_PUSH_UNAUTHORIZED"
  | "PRE_PUSH_CONVERSATION_BLOCKED"
  | "PRE_PUSH_MISSING"
  | "DELIVERY_FAILED"
  | "DELIVERY_NOT_SENT";

function idPrefix(id: string): string {
  return id.slice(0, ID_PREFIX_LEN);
}

export function buildAgentUnreadReminderPushPayload(leadId: string): PushPayload {
  return {
    type: CUSTOMER_CHAT_PUSH_TYPE,
    title: CHAT_UNREAD_REMINDER_PUSH_TITLE,
    body: CHAT_UNREAD_REMINDER_PUSH_BODY,
    href: chatsPageHref(leadId),
  };
}

export function emptyChatUnreadReminderCronSummary(): ChatUnreadReminderCronSummary {
  return {
    job: CHAT_UNREAD_REMINDER_CRON.job,
    candidatesScanned: 0,
    eligibleClaims: 0,
    remindersAttempted: 0,
    remindersSent: 0,
    skipped: 0,
    errors: 0,
  };
}

/**
 * Fair candidate page: oldest lastMessageAt first within each ACTIVE workspace,
 * capped per workspace, then globally limited. lastMessageAt is only a scan
 * bound — streak identity remains inside claimAgentUnreadReminder.
 */
export async function loadChatUnreadReminderCandidates(
  db: ChatUnreadReminderCronDb,
  input: {
    now: Date;
    scan: number;
    perWorkspace: number;
  },
): Promise<ChatUnreadReminderCandidate[]> {
  const cutoff = new Date(
    input.now.getTime() - AGENT_UNREAD_REMINDER_DELAY_MS,
  );
  const rows = await db.$queryRaw<ChatUnreadReminderCandidate[]>`
    WITH ranked AS (
      SELECT
        c."id" AS "id",
        c."workspaceId" AS "workspaceId",
        c."leadId" AS "leadId",
        c."status"::text AS "status",
        c."lastMessageAt" AS "lastMessageAt",
        c."agentUnreadReminderMessageId" AS "agentUnreadReminderMessageId",
        c."agentUnreadReminderAgentId" AS "agentUnreadReminderAgentId",
        l."assignedAgentId" AS "assignedAgentId",
        ROW_NUMBER() OVER (
          PARTITION BY c."workspaceId"
          ORDER BY c."lastMessageAt" ASC NULLS LAST, c."id" ASC
        ) AS "rn"
      FROM "Conversation" c
      INNER JOIN "Lead" l
        ON l."id" = c."leadId"
       AND l."workspaceId" = c."workspaceId"
      INNER JOIN "Workspace" w
        ON w."id" = c."workspaceId"
      WHERE w."status" = 'ACTIVE'
        AND c."status" = 'OPEN'
        AND c."lastMessageAt" IS NOT NULL
        AND c."lastMessageAt" <= ${cutoff}
        AND l."assignedAgentId" IS NOT NULL
    )
    SELECT
      "id",
      "workspaceId",
      "leadId",
      "status",
      "lastMessageAt",
      "agentUnreadReminderMessageId",
      "agentUnreadReminderAgentId",
      "assignedAgentId"
    FROM ranked
    WHERE "rn" <= ${input.perWorkspace}
    ORDER BY "workspaceId" ASC, "lastMessageAt" ASC NULLS LAST, "id" ASC
    LIMIT ${input.scan}
  `;
  return rows;
}

export async function defaultLoadPrePushSnapshot(
  db: ChatUnreadReminderCronDb,
  claim: AgentUnreadReminderClaim,
): Promise<ChatUnreadReminderPrePushSnapshot | null> {
  const rows = await db.$queryRaw<
    Array<{
      assignedAgentId: string | null;
      agentLastReadAt: Date | null;
      agentLastReadByUserId: string | null;
      agentUnreadReminderMessageId: string | null;
      agentUnreadReminderAgentId: string | null;
      conversationStatus: string;
      disabledAt: Date | null;
      pushNotificationPrefs: unknown;
    }>
  >`
    SELECT
      l."assignedAgentId" AS "assignedAgentId",
      c."agentLastReadAt" AS "agentLastReadAt",
      c."agentLastReadByUserId" AS "agentLastReadByUserId",
      c."agentUnreadReminderMessageId" AS "agentUnreadReminderMessageId",
      c."agentUnreadReminderAgentId" AS "agentUnreadReminderAgentId",
      c."status"::text AS "conversationStatus",
      u."disabledAt" AS "disabledAt",
      u."pushNotificationPrefs" AS "pushNotificationPrefs"
    FROM "Conversation" c
    INNER JOIN "Lead" l
      ON l."id" = c."leadId"
     AND l."workspaceId" = c."workspaceId"
    LEFT JOIN "User" u
      ON u."id" = ${claim.assignedAgentId}
    WHERE c."workspaceId" = ${claim.workspaceId}
      AND c."id" = ${claim.conversationId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    assignedAgentId: row.assignedAgentId,
    agentLastReadAt: row.agentLastReadAt,
    agentLastReadByUserId: row.agentLastReadByUserId,
    agentUnreadReminderMessageId: row.agentUnreadReminderMessageId,
    agentUnreadReminderAgentId: row.agentUnreadReminderAgentId,
    disabledAt: row.disabledAt,
    pushNotificationPrefs: row.pushNotificationPrefs,
    conversationStatus: row.conversationStatus,
  };
}

/**
 * Final checks after claim, before FCM. Skips push without un-claiming
 * (at-most-once). Residual: mark-read that does not move the stored cursor
 * fields in a way we detect is unlikely; we treat any agentLastReadAt change
 * after claim.remindedAt as abort.
 */
export function evaluatePrePushDeliveryGate(
  claim: AgentUnreadReminderClaim,
  snapshot: ChatUnreadReminderPrePushSnapshot | null,
): { ok: true } | { ok: false; reason: ChatUnreadReminderAbortReason } {
  if (!snapshot) return { ok: false, reason: "PRE_PUSH_MISSING" };
  if (snapshot.conversationStatus !== "OPEN") {
    return { ok: false, reason: "PRE_PUSH_CONVERSATION_BLOCKED" };
  }
  if (snapshot.assignedAgentId !== claim.assignedAgentId) {
    return { ok: false, reason: "PRE_PUSH_ASSIGNMENT_CHANGED" };
  }
  if (
    snapshot.agentUnreadReminderMessageId !== claim.streakMessageId ||
    snapshot.agentUnreadReminderAgentId !== claim.assignedAgentId
  ) {
    return { ok: false, reason: "PRE_PUSH_MISSING" };
  }
  if (snapshot.disabledAt) {
    return { ok: false, reason: "PRE_PUSH_AGENT_INELIGIBLE" };
  }
  if (!isPushTypeEnabled(snapshot.pushNotificationPrefs, CUSTOMER_CHAT_PUSH_TYPE)) {
    return { ok: false, reason: "PRE_PUSH_PREFERENCE_OFF" };
  }
  // Mark-read stores latest message createdAt (not wall clock). If the valid
  // assignee cursor is at/after the streak message, it is no longer unread.
  if (
    snapshot.agentLastReadByUserId === claim.assignedAgentId &&
    snapshot.agentLastReadAt &&
    claim.streakCreatedAt.getTime() <= snapshot.agentLastReadAt.getTime()
  ) {
    return { ok: false, reason: "PRE_PUSH_CURSOR_CHANGED" };
  }
  return { ok: true };
}

export function isPushDeliverySent(
  result: Pick<PushDeliveryResult, "status"> | null | undefined,
): boolean {
  return result?.status === "sent";
}

function cronLog(
  event: string,
  fields: Record<string, string | number | boolean | null | undefined>,
): void {
  console.info(`[chat:unread-reminder:cron] ${event}`, fields);
}

export async function runChatUnreadReminderCron(
  deps: ChatUnreadReminderCronDeps,
): Promise<ChatUnreadReminderCronSummary> {
  const summary = emptyChatUnreadReminderCronSummary();
  const now = deps.now ?? new Date();
  const batch = Math.max(1, deps.batch ?? CHAT_UNREAD_REMINDER_CRON_BATCH);
  const scan = Math.max(batch, deps.scan ?? CHAT_UNREAD_REMINDER_CRON_SCAN);
  const perWorkspace = Math.max(
    1,
    deps.perWorkspace ?? CHAT_UNREAD_REMINDER_CRON_PER_WORKSPACE,
  );
  const claimFn = deps.claimAgentUnreadReminder ?? claimAgentUnreadReminder;
  const deliver = deps.deliverPushToUsersNow ?? deliverPushToUsersNow;
  const authorize =
    deps.authorizeStaffRecipientForLead ?? authorizeStaffRecipientForLead;
  const loadSnapshot = deps.loadPrePushSnapshot ?? defaultLoadPrePushSnapshot;

  let candidates: ChatUnreadReminderCandidate[];
  try {
    candidates = await loadChatUnreadReminderCandidates(deps.db, {
      now,
      scan,
      perWorkspace,
    });
  } catch (error) {
    summary.errors += 1;
    cronLog("candidate_scan_failed", {
      error: error instanceof Error ? error.name : "ERROR",
    });
    return summary;
  }

  for (const candidate of candidates) {
    if (summary.eligibleClaims >= batch) break;
    summary.candidatesScanned += 1;

    const preliminary = isLikelyAgentUnreadReminderCandidate(
      {
        status: candidate.status,
        lastMessageAt: candidate.lastMessageAt,
        agentUnreadReminderMessageId: candidate.agentUnreadReminderMessageId,
        agentUnreadReminderAgentId: candidate.agentUnreadReminderAgentId,
      } satisfies Pick<
        AgentUnreadReminderConversationRow,
        | "status"
        | "lastMessageAt"
        | "agentUnreadReminderMessageId"
        | "agentUnreadReminderAgentId"
      >,
      now,
    );
    if (!preliminary || !candidate.assignedAgentId) {
      summary.skipped += 1;
      continue;
    }

    let claimResult;
    try {
      claimResult = await claimFn(deps.db, {
        workspaceId: candidate.workspaceId,
        conversationId: candidate.id,
        now,
      });
    } catch (error) {
      summary.errors += 1;
      cronLog("claim_failed", {
        conversationPrefix: idPrefix(candidate.id),
        workspacePrefix: idPrefix(candidate.workspaceId),
        error: error instanceof Error ? error.name : "ERROR",
      });
      continue;
    }

    if (!claimResult.ok) {
      summary.skipped += 1;
      continue;
    }

    summary.eligibleClaims += 1;
    const claim = claimResult.claim;

    let snapshot: ChatUnreadReminderPrePushSnapshot | null;
    try {
      snapshot = await loadSnapshot(deps.db, claim);
    } catch (error) {
      summary.errors += 1;
      cronLog("pre_push_load_failed", {
        conversationPrefix: idPrefix(claim.conversationId),
        error: error instanceof Error ? error.name : "ERROR",
      });
      continue;
    }

    const gate = evaluatePrePushDeliveryGate(claim, snapshot);
    if (!gate.ok) {
      summary.skipped += 1;
      cronLog("pre_push_abort", {
        conversationPrefix: idPrefix(claim.conversationId),
        reason: gate.reason,
      });
      continue;
    }

    const authorized = await authorize({
      userId: claim.assignedAgentId,
      leadId: claim.leadId,
      event: CUSTOMER_CHAT_PUSH_TYPE,
    });
    if (!authorized) {
      summary.skipped += 1;
      cronLog("pre_push_abort", {
        conversationPrefix: idPrefix(claim.conversationId),
        reason: "PRE_PUSH_UNAUTHORIZED",
      });
      continue;
    }

    summary.remindersAttempted += 1;
    const payload = buildAgentUnreadReminderPushPayload(claim.leadId);
    cronLog("push_attempt", {
      conversationPrefix: idPrefix(claim.conversationId),
      leadPrefix: idPrefix(claim.leadId),
      recipientPrefix: idPrefix(claim.assignedAgentId),
      streakPrefix: idPrefix(claim.streakMessageId),
    });

    try {
      const results = await deliver([claim.assignedAgentId], payload);
      const row = results[0];
      if (isPushDeliverySent(row)) {
        summary.remindersSent += 1;
        cronLog("push_sent", {
          conversationPrefix: idPrefix(claim.conversationId),
          recipientPrefix: idPrefix(claim.assignedAgentId),
        });
      } else {
        summary.errors += 1;
        cronLog("push_not_sent", {
          conversationPrefix: idPrefix(claim.conversationId),
          recipientPrefix: idPrefix(claim.assignedAgentId),
          status: row?.status ?? "missing",
        });
      }
    } catch (error) {
      summary.errors += 1;
      cronLog("push_failed", {
        conversationPrefix: idPrefix(claim.conversationId),
        error: error instanceof Error ? error.name : "ERROR",
      });
    }
  }

  return summary;
}
