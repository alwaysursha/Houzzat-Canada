import type { PrismaClient } from "@prisma/client";
import type { AgentOrgContext } from "@/lib/agent";
import {
  AGENT_SMS_TEXT_MAX_LENGTH,
  sendAgentLeadSmsMessage,
  type AgentSmsContextDb,
  type AgentSmsSendDeps,
} from "@/lib/conversations/agent-conversation-sms";
import { estimateSmsSegmentCount } from "@/lib/sms/segments";
import {
  hasSmsUsageDelegate,
  inspectSmsAllowance,
  SMS_MANUAL_USAGE_CATEGORIES,
  type SmsUsageAllowanceReason,
  type SmsUsageDb,
} from "@/lib/sms/usage";
import {
  listActiveSmsQuickTexts,
  type SmsQuickTextDb,
  type SmsQuickTextRow,
} from "@/lib/platform/sms-quick-texts";
import { validateSmsTemplateBody } from "@/lib/platform/sms-automations/variables";
import {
  SMS_MASS_TICK_SIZE,
  SMS_MASS_V1_MAX_RECIPIENTS,
  SMS_MASS_VARIABLES,
} from "./constants";
import {
  classifyMassSmsLeads,
  summarizeSmsMassExclusions,
  type MassSmsLeadRow,
  type MassSmsRecipientDecision,
} from "./eligibility";

export const MASS_SMS_LEAD_SELECT = {
  id: true,
  workspaceId: true,
  assignedAgentId: true,
  customer: { select: { phoneE164: true, phone: true, name: true } },
  workspace: {
    select: {
      name: true,
      twilioPhoneE164: true,
      twilioSubaccountSid: true,
      twilioMessagingServiceSid: true,
    },
  },
} as const;

export type SmsMassBatchStatus = "PENDING" | "RUNNING" | "COMPLETE" | "BLOCKED";
export type SmsMassRecipientStatus =
  | "PENDING"
  | "PROCESSING"
  | "SENT"
  | "FAILED"
  | "EXCLUDED";

export type SmsMassBatchRow = {
  id: string;
  workspaceId: string;
  agentUserId: string;
  clientKey: string;
  body: string;
  status: SmsMassBatchStatus;
  requestedCount: number;
  eligibleCount: number;
  excludedCount: number;
  successfulCount: number;
  failedCount: number;
  estimatedSegments: number;
  createdAt: Date;
  updatedAt: Date;
};

export type SmsMassRecipientRow = {
  id: string;
  batchId: string;
  leadId: string;
  status: SmsMassRecipientStatus;
  excludeReason: string | null;
  twilioMessageSid: string | null;
  messageId: string | null;
  segmentCount: number | null;
  errorCode: string | null;
  processedAt: Date | null;
};

export type MassSmsDb = Omit<AgentSmsContextDb, "lead"> &
  SmsUsageDb & {
    lead: AgentSmsContextDb["lead"] & {
      findMany: (args: {
        where: { id: { in: string[] } };
        select: typeof MASS_SMS_LEAD_SELECT;
      }) => Promise<MassSmsLeadRow[]>;
    };
    smsMassBatch: {
      findUnique: (args: {
        where:
          | { id: string }
          | {
              workspaceId_agentUserId_clientKey: {
                workspaceId: string;
                agentUserId: string;
                clientKey: string;
              };
            };
      }) => Promise<SmsMassBatchRow | null>;
      create: (args: {
        data: Omit<SmsMassBatchRow, "id" | "createdAt" | "updatedAt"> & {
          id?: string;
        };
      }) => Promise<SmsMassBatchRow>;
      update: (args: {
        where: { id: string };
        data: Partial<
          Pick<
            SmsMassBatchRow,
            | "status"
            | "requestedCount"
            | "eligibleCount"
            | "excludedCount"
            | "successfulCount"
            | "failedCount"
            | "estimatedSegments"
            | "updatedAt"
          >
        >;
      }) => Promise<SmsMassBatchRow>;
    };
    smsMassBatchRecipient: {
      findMany: (args: {
        where: { batchId: string } | { batchId: string; status: SmsMassRecipientStatus };
      }) => Promise<SmsMassRecipientRow[]>;
      create: (args: {
        data: Omit<SmsMassRecipientRow, "id"> & { id?: string };
      }) => Promise<SmsMassRecipientRow>;
      update: (args: {
        where: { id: string };
        data: Partial<SmsMassRecipientRow>;
      }) => Promise<SmsMassRecipientRow>;
      updateMany: (args: {
        where: {
          id: string;
          status?: { in: SmsMassRecipientStatus[] } | SmsMassRecipientStatus;
        };
        data: Partial<
          Pick<
            SmsMassRecipientRow,
            "status" | "processedAt" | "errorCode" | "excludeReason"
          >
        >;
      }) => Promise<{ count: number }>;
    };
    smsQuickText?: SmsQuickTextDb["smsQuickText"];
  };

export type MassSmsSendDeps = AgentSmsSendDeps & {
  tickSize?: number;
  retryFailed?: boolean;
};

export type MassSmsQuickTextView = {
  id: string;
  key: string;
  name: string;
  category: string;
  body: string;
};

export type MassSmsExclusionSummary = ReturnType<
  typeof summarizeSmsMassExclusions
>;

export type MassSmsPreview = {
  selectedCount: number;
  eligibleCount: number;
  excludedCount: number;
  exclusionReasons: MassSmsExclusionSummary;
  composerSegments: number;
  estimatedTotalSegments: number;
  remainingSegments: number | null;
  allowanceSegments: number | null;
  usedSegments: number;
  allowancePermitted: boolean;
  allowanceReason: SmsUsageAllowanceReason;
  batchLimit: number;
  overLimit: boolean;
  bodyValid: boolean;
  bodyIssues: Array<{ placeholder: string; reason: "unknown" | "not_allowed" }>;
  quickTexts: MassSmsQuickTextView[];
  maxBodyLength: number;
};

export type MassSmsBatchSummary = {
  id: string;
  clientKey: string;
  status: SmsMassBatchStatus;
  requestedCount: number;
  eligibleCount: number;
  excludedCount: number;
  successfulCount: number;
  failedCount: number;
  estimatedSegments: number;
  actualSegments: number;
  remainingSegments: number | null;
  allowanceReason: SmsUsageAllowanceReason;
  exclusionReasons: MassSmsExclusionSummary;
  confirmationPrompt: string | null;
};

export type ConfirmMassSmsResult =
  | {
      ok: false;
      error:
        | "NO_WORKSPACE"
        | "INVALID_BODY"
        | "INVALID_CLIENT_KEY"
        | "NO_RECIPIENTS"
        | "BATCH_LIMIT";
      preview?: MassSmsPreview;
    }
  | {
      ok: true;
      summary: MassSmsBatchSummary;
      continue: boolean;
    };

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

export function uniqueMassSmsLeadIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function isMassSafeSmsQuickText(row: {
  active: boolean;
  body: string;
}): boolean {
  if (!row.active) return false;
  return validateSmsTemplateBody(row.body, SMS_MASS_VARIABLES).ok;
}

export function validateMassSmsBody(body: string) {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > AGENT_SMS_TEXT_MAX_LENGTH) {
    return {
      ok: false as const,
      issues: [{ placeholder: "", reason: "unknown" as const }],
    };
  }
  return validateSmsTemplateBody(trimmed, SMS_MASS_VARIABLES);
}

export async function listMassSafeSmsQuickTexts(
  db: Pick<MassSmsDb, "smsQuickText">,
): Promise<MassSmsQuickTextView[]> {
  if (!db.smsQuickText) return [];
  const rows = await listActiveSmsQuickTexts({
    smsQuickText: db.smsQuickText,
  });
  return rows.filter(isMassSafeSmsQuickText).map((row: SmsQuickTextRow) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    category: row.category,
    body: row.body,
  }));
}

async function loadMassLeads(db: MassSmsDb, ids: string[]) {
  if (ids.length === 0) return [];
  return db.lead.findMany({
    where: { id: { in: ids } },
    select: MASS_SMS_LEAD_SELECT,
  });
}

export async function previewMassSms(
  db: MassSmsDb,
  ctx: AgentOrgContext,
  input: { leadIds: string[]; body: string },
): Promise<MassSmsPreview> {
  const leadIds = uniqueMassSmsLeadIds(input.leadIds);
  const overLimit = leadIds.length > SMS_MASS_V1_MAX_RECIPIENTS;
  const bodyCheck = validateMassSmsBody(input.body);
  const quickTexts = await listMassSafeSmsQuickTexts(db);
  const composerSegments = estimateSmsSegmentCount(input.body.trim());

  const emptyAllowance = {
    remainingSegments: null as number | null,
    allowanceSegments: null as number | null,
    usedSegments: 0,
    allowancePermitted: false,
    allowanceReason: "ALLOWANCE_NOT_CONFIGURED" as SmsUsageAllowanceReason,
  };

  if (!ctx.workspaceId || overLimit || !bodyCheck.ok) {
    return {
      selectedCount: leadIds.length,
      eligibleCount: 0,
      excludedCount: leadIds.length,
      exclusionReasons: [],
      composerSegments,
      estimatedTotalSegments: 0,
      ...emptyAllowance,
      batchLimit: SMS_MASS_V1_MAX_RECIPIENTS,
      overLimit,
      bodyValid: bodyCheck.ok,
      bodyIssues: bodyCheck.ok ? [] : bodyCheck.issues,
      quickTexts,
      maxBodyLength: AGENT_SMS_TEXT_MAX_LENGTH,
    };
  }

  const leads = await loadMassLeads(db, leadIds);
  const decisions = await classifyMassSmsLeads({
    ctx,
    leads,
    requestedIds: leadIds,
    body: input.body.trim(),
    db,
  });
  const eligible = decisions.filter((row) => row.eligible);
  const estimatedTotalSegments = eligible.reduce(
    (sum, row) => sum + Math.max(1, estimateSmsSegmentCount(row.renderedBody)),
    0,
  );

  let allowance = emptyAllowance;
  if (hasSmsUsageDelegate(db)) {
    try {
      const snapshot = await inspectSmsAllowance(ctx.workspaceId, {
        db,
        requestedSegments:
          estimatedTotalSegments > 0 ? estimatedTotalSegments : 0,
        categories: SMS_MANUAL_USAGE_CATEGORIES,
      });
      allowance = {
        remainingSegments: snapshot.remainingSegments,
        allowanceSegments: snapshot.allowanceSegments,
        usedSegments: snapshot.usedSegments,
        allowancePermitted:
          estimatedTotalSegments === 0 ? snapshot.reason == null : snapshot.permitted,
        allowanceReason: snapshot.reason,
      };
      if (estimatedTotalSegments === 0 && snapshot.allowanceSegments != null) {
        allowance.allowancePermitted = true;
        allowance.allowanceReason = null;
      }
    } catch {
      allowance = emptyAllowance;
    }
  }

  return {
    selectedCount: leadIds.length,
    eligibleCount: eligible.length,
    excludedCount: decisions.length - eligible.length,
    exclusionReasons: summarizeSmsMassExclusions(decisions),
    composerSegments,
    estimatedTotalSegments,
    ...allowance,
    batchLimit: SMS_MASS_V1_MAX_RECIPIENTS,
    overLimit,
    bodyValid: true,
    bodyIssues: [],
    quickTexts,
    maxBodyLength: AGENT_SMS_TEXT_MAX_LENGTH,
  };
}

function confirmationPrompt(eligibleCount: number, estimatedSegments: number) {
  if (eligibleCount <= 0) return null;
  return `Send to ${eligibleCount} eligible lead${eligibleCount === 1 ? "" : "s"} using approximately ${estimatedSegments} SMS segment${estimatedSegments === 1 ? "" : "s"}?`;
}

function actualSegments(recipients: SmsMassRecipientRow[]) {
  return recipients.reduce((sum, row) => sum + (row.segmentCount ?? 0), 0);
}

function exclusionFromRecipients(
  recipients: SmsMassRecipientRow[],
): MassSmsExclusionSummary {
  const decisions: MassSmsRecipientDecision[] = recipients
    .filter((row) => row.status === "EXCLUDED" && row.excludeReason)
    .map((row) => ({
      leadId: row.leadId,
      eligible: false,
      reason: row.excludeReason as MassSmsRecipientDecision["reason"],
      toE164: null,
      fromE164: null,
      context: {},
      renderedBody: "",
    }));
  return summarizeSmsMassExclusions(decisions);
}

async function presentBatch(
  db: MassSmsDb,
  batch: SmsMassBatchRow,
  remainingSegments: number | null = null,
  allowanceReason: SmsUsageAllowanceReason = null,
): Promise<MassSmsBatchSummary> {
  const recipients = await db.smsMassBatchRecipient.findMany({
    where: { batchId: batch.id },
  });
  return {
    id: batch.id,
    clientKey: batch.clientKey,
    status: batch.status,
    requestedCount: batch.requestedCount,
    eligibleCount: batch.eligibleCount,
    excludedCount: batch.excludedCount,
    successfulCount: batch.successfulCount,
    failedCount: batch.failedCount,
    estimatedSegments: batch.estimatedSegments,
    actualSegments: actualSegments(recipients),
    remainingSegments,
    allowanceReason,
    exclusionReasons: exclusionFromRecipients(recipients),
    confirmationPrompt: confirmationPrompt(
      batch.eligibleCount,
      batch.estimatedSegments,
    ),
  };
}

async function refreshBatchCounts(db: MassSmsDb, batchId: string) {
  const recipients = await db.smsMassBatchRecipient.findMany({
    where: { batchId },
  });
  const successfulCount = recipients.filter((row) => row.status === "SENT").length;
  const failedCount = recipients.filter((row) => row.status === "FAILED").length;
  const excludedCount = recipients.filter(
    (row) => row.status === "EXCLUDED",
  ).length;
  const pendingWork = recipients.some(
    (row) => row.status === "PENDING" || row.status === "PROCESSING",
  );
  const current = await db.smsMassBatch.findUnique({ where: { id: batchId } });
  if (!current) return null;
  if (current.status === "BLOCKED") {
    return db.smsMassBatch.update({
      where: { id: batchId },
      data: { successfulCount, failedCount, excludedCount, updatedAt: new Date() },
    });
  }
  const status: SmsMassBatchStatus = pendingWork ? "RUNNING" : "COMPLETE";
  return db.smsMassBatch.update({
    where: { id: batchId },
    data: {
      successfulCount,
      failedCount,
      excludedCount,
      status,
      updatedAt: new Date(),
    },
  });
}

async function createRecipientRows(
  db: MassSmsDb,
  batchId: string,
  decisions: MassSmsRecipientDecision[],
) {
  for (const decision of decisions) {
    await db.smsMassBatchRecipient.create({
      data: {
        batchId,
        leadId: decision.leadId,
        status: decision.eligible ? "PENDING" : "EXCLUDED",
        excludeReason: decision.eligible ? null : decision.reason,
        twilioMessageSid: null,
        messageId: null,
        segmentCount: decision.eligible
          ? estimateSmsSegmentCount(decision.renderedBody)
          : null,
        errorCode: null,
        processedAt: decision.eligible ? null : new Date(),
      },
    });
  }
}

export async function confirmMassSms(
  db: MassSmsDb,
  ctx: AgentOrgContext,
  input: { clientKey: string; leadIds: string[]; body: string },
  deps: MassSmsSendDeps = {},
): Promise<ConfirmMassSmsResult> {
  const workspaceId = ctx.workspaceId?.trim() || "";
  if (!workspaceId) return { ok: false, error: "NO_WORKSPACE" };

  const clientKey = input.clientKey.trim();
  if (clientKey.length < 8 || clientKey.length > 80) {
    return { ok: false, error: "INVALID_CLIENT_KEY" };
  }

  const existing = await db.smsMassBatch.findUnique({
    where: {
      workspaceId_agentUserId_clientKey: {
        workspaceId,
        agentUserId: ctx.user.id,
        clientKey,
      },
    },
  });
  if (existing) {
    if (existing.status === "BLOCKED") {
      const retry = await maybeUnblockMassSmsBatch(db, ctx, existing, deps);
      return {
        ok: true,
        summary: retry.summary,
        continue: retry.continue,
      };
    }
    await resetFailedRecipients(db, existing.id);
    const continued = await processSmsMassBatchTick(db, ctx, existing.id, deps);
    const batch = await db.smsMassBatch.findUnique({ where: { id: existing.id } });
    return {
      ok: true,
      summary: await presentBatch(db, batch ?? existing),
      continue: continued.continue,
    };
  }

  const preview = await previewMassSms(db, ctx, input);
  if (preview.overLimit) {
    return { ok: false, error: "BATCH_LIMIT", preview };
  }
  if (!preview.bodyValid) {
    return { ok: false, error: "INVALID_BODY", preview };
  }
  const leadIds = uniqueMassSmsLeadIds(input.leadIds);
  if (leadIds.length === 0) {
    return { ok: false, error: "NO_RECIPIENTS", preview };
  }

  const leads = await loadMassLeads(db, leadIds);
  const decisions = await classifyMassSmsLeads({
    ctx,
    leads,
    requestedIds: leadIds,
    body: input.body.trim(),
    db,
  });
  const eligible = decisions.filter((row) => row.eligible);
  const estimatedSegments = eligible.reduce(
    (sum, row) => sum + Math.max(1, estimateSmsSegmentCount(row.renderedBody)),
    0,
  );

  let blocked = false;
  let allowanceReason: SmsUsageAllowanceReason = "ALLOWANCE_NOT_CONFIGURED";
  let remainingSegments: number | null = null;
  if (eligible.length > 0) {
    if (!hasSmsUsageDelegate(db)) {
      blocked = true;
    } else {
      try {
        const snapshot = await inspectSmsAllowance(workspaceId, {
          db,
          requestedSegments: Math.max(1, estimatedSegments),
          categories: SMS_MANUAL_USAGE_CATEGORIES,
        });
        remainingSegments = snapshot.remainingSegments;
        allowanceReason = snapshot.reason;
        if (!snapshot.permitted) blocked = true;
      } catch {
        blocked = true;
        allowanceReason = "ALLOWANCE_NOT_CONFIGURED";
      }
    }
  } else {
    allowanceReason = null;
  }

  let batch: SmsMassBatchRow;
  try {
    batch = await db.smsMassBatch.create({
      data: {
        workspaceId,
        agentUserId: ctx.user.id,
        clientKey,
        body: input.body.trim(),
        status: blocked ? "BLOCKED" : eligible.length > 0 ? "PENDING" : "COMPLETE",
        requestedCount: leadIds.length,
        eligibleCount: eligible.length,
        excludedCount: decisions.length - eligible.length,
        successfulCount: 0,
        failedCount: 0,
        estimatedSegments,
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const raced = await db.smsMassBatch.findUnique({
      where: {
        workspaceId_agentUserId_clientKey: {
          workspaceId,
          agentUserId: ctx.user.id,
          clientKey,
        },
      },
    });
    if (!raced) throw error;
    const continued = await processSmsMassBatchTick(db, ctx, raced.id, deps);
    return {
      ok: true,
      summary: await presentBatch(db, raced),
      continue: continued.continue,
    };
  }

  await createRecipientRows(db, batch.id, decisions);

  if (blocked) {
    return {
      ok: true,
      summary: await presentBatch(db, batch, remainingSegments, allowanceReason),
      continue: false,
    };
  }

  const tick = await processSmsMassBatchTick(db, ctx, batch.id, deps);
  const latest = await db.smsMassBatch.findUnique({ where: { id: batch.id } });
  return {
    ok: true,
    summary: await presentBatch(db, latest ?? batch, remainingSegments, null),
    continue: tick.continue,
  };
}

async function maybeUnblockMassSmsBatch(
  db: MassSmsDb,
  ctx: AgentOrgContext,
  batch: SmsMassBatchRow,
  deps: MassSmsSendDeps,
): Promise<{ summary: MassSmsBatchSummary; continue: boolean }> {
  if (!hasSmsUsageDelegate(db) || !ctx.workspaceId) {
    return {
      summary: await presentBatch(
        db,
        batch,
        null,
        "ALLOWANCE_NOT_CONFIGURED",
      ),
      continue: false,
    };
  }
  try {
    const snapshot = await inspectSmsAllowance(ctx.workspaceId, {
      db,
      requestedSegments: Math.max(1, batch.estimatedSegments),
      categories: SMS_MANUAL_USAGE_CATEGORIES,
    });
    if (!snapshot.permitted) {
      return {
        summary: await presentBatch(
          db,
          batch,
          snapshot.remainingSegments,
          snapshot.reason,
        ),
        continue: false,
      };
    }
  } catch {
    return {
      summary: await presentBatch(
        db,
        batch,
        null,
        "ALLOWANCE_NOT_CONFIGURED",
      ),
      continue: false,
    };
  }

  const unlocked = await db.smsMassBatch.update({
    where: { id: batch.id },
    data: { status: "PENDING", updatedAt: new Date() },
  });
  const tick = await processSmsMassBatchTick(db, ctx, unlocked.id, deps);
  const latest = await db.smsMassBatch.findUnique({ where: { id: batch.id } });
  return {
    summary: await presentBatch(db, latest ?? unlocked),
    continue: tick.continue,
  };
}

async function claimRecipient(db: MassSmsDb, recipient: SmsMassRecipientRow) {
  const claimed = await db.smsMassBatchRecipient.updateMany({
    where: {
      id: recipient.id,
      status: { in: ["PENDING", "FAILED"] },
    },
    data: {
      status: "PROCESSING",
      processedAt: new Date(),
      errorCode: null,
    },
  });
  return claimed.count === 1;
}

export async function processSmsMassBatchTick(
  db: MassSmsDb,
  ctx: AgentOrgContext,
  batchId: string,
  deps: MassSmsSendDeps = {},
): Promise<{ continue: boolean; processed: number }> {
  const batch = await db.smsMassBatch.findUnique({ where: { id: batchId } });
  if (!batch) return { continue: false, processed: 0 };
  if (batch.status === "BLOCKED" || batch.status === "COMPLETE") {
    return { continue: false, processed: 0 };
  }
  if (batch.agentUserId !== ctx.user.id || batch.workspaceId !== ctx.workspaceId) {
    return { continue: false, processed: 0 };
  }

  await db.smsMassBatch.update({
    where: { id: batch.id },
    data: { status: "RUNNING", updatedAt: new Date() },
  });

  const recipients = await db.smsMassBatchRecipient.findMany({
    where: { batchId: batch.id },
  });
  const work = recipients.filter((row) =>
    deps.retryFailed
      ? row.status === "PENDING" || row.status === "FAILED"
      : row.status === "PENDING",
  );
  const tickSize = Math.max(1, deps.tickSize ?? SMS_MASS_TICK_SIZE);
  const slice = work.slice(0, tickSize);
  let processed = 0;

  for (const recipient of slice) {
    const claimed = await claimRecipient(db, recipient);
    if (!claimed) continue;
    processed += 1;

    const leads = await loadMassLeads(db, [recipient.leadId]);
    const [decision] = await classifyMassSmsLeads({
      ctx,
      leads,
      requestedIds: [recipient.leadId],
      body: batch.body,
      db,
    });
    if (!decision?.eligible) {
      await db.smsMassBatchRecipient.update({
        where: { id: recipient.id },
        data: {
          status: "EXCLUDED",
          excludeReason: decision?.reason ?? "NOT_FOUND",
          processedAt: new Date(),
          errorCode: null,
        },
      });
      continue;
    }

    try {
      const sent = await sendAgentLeadSmsMessage(
        db,
        ctx,
        recipient.leadId,
        decision.renderedBody,
        {
          ...deps,
          usageCategory: "AGENT_MASS",
          skipAllowanceGate: true,
          usageDb: hasSmsUsageDelegate(db) ? db : deps.usageDb,
        },
      );

      if (sent.ok) {
        await db.smsMassBatchRecipient.update({
          where: { id: recipient.id },
          data: {
            status: "SENT",
            twilioMessageSid: sent.twilioMessageSid,
            messageId: sent.data.message.id,
            segmentCount: Math.max(
              1,
              estimateSmsSegmentCount(decision.renderedBody),
            ),
            errorCode: null,
            processedAt: new Date(),
          },
        });
        continue;
      }

      await db.smsMassBatchRecipient.update({
        where: { id: recipient.id },
        data: {
          status: "FAILED",
          errorCode: sent.reason,
          processedAt: new Date(),
        },
      });
    } catch {
      await db.smsMassBatchRecipient.update({
        where: { id: recipient.id },
        data: {
          status: "FAILED",
          errorCode: "SMS_SEND_FAILED",
          processedAt: new Date(),
        },
      });
    }
  }

  const latest = await refreshBatchCounts(db, batch.id);
  const leftover = latest
    ? await db.smsMassBatchRecipient.findMany({ where: { batchId: batch.id } })
    : [];
  const remaining = leftover.some((row) => row.status === "PENDING");
  return { continue: Boolean(latest && latest.status !== "BLOCKED" && remaining), processed };
}

async function resetFailedRecipients(db: MassSmsDb, batchId: string) {
  const recipients = await db.smsMassBatchRecipient.findMany({
    where: { batchId },
  });
  let reset = 0;
  for (const row of recipients) {
    if (row.status !== "FAILED") continue;
    await db.smsMassBatchRecipient.update({
      where: { id: row.id },
      data: {
        status: "PENDING",
        errorCode: null,
        processedAt: null,
      },
    });
    reset += 1;
  }
  if (reset > 0) {
    await db.smsMassBatch.update({
      where: { id: batchId },
      data: { status: "PENDING", updatedAt: new Date() },
    });
  }
}

export async function drainSmsMassBatch(
  db: MassSmsDb,
  ctx: AgentOrgContext,
  batchId: string,
  deps: MassSmsSendDeps = {},
): Promise<MassSmsBatchSummary | null> {
  const tickSize = Math.max(1, deps.tickSize ?? SMS_MASS_TICK_SIZE);
  const maxTicks = Math.ceil(SMS_MASS_V1_MAX_RECIPIENTS / tickSize) + 2;
  for (let i = 0; i < maxTicks; i += 1) {
    const tick = await processSmsMassBatchTick(db, ctx, batchId, deps);
    if (!tick.continue) break;
  }
  const batch = await db.smsMassBatch.findUnique({ where: { id: batchId } });
  if (!batch) return null;
  return presentBatch(db, batch);
}

export async function getMassSmsBatch(
  db: MassSmsDb,
  ctx: AgentOrgContext,
  batchId: string,
): Promise<MassSmsBatchSummary | null> {
  const id = batchId.trim();
  if (!id || !ctx.workspaceId) return null;
  const batch = await db.smsMassBatch.findUnique({ where: { id } });
  if (!batch) return null;
  if (batch.workspaceId !== ctx.workspaceId) return null;
  if (batch.agentUserId !== ctx.user.id) return null;
  return presentBatch(db, batch);
}

export function prismaMassSmsDb(prisma: PrismaClient): MassSmsDb {
  return prisma as unknown as MassSmsDb;
}
