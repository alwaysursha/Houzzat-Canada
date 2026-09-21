/**
 * Historical duplicate Lead reconciliation (workspaceId + customerId).
 *
 * Canonical = earliest createdAt (original relationship). Duplicate capture
 * never determines ownership — surviving assignedAgentId is the canonical Lead's.
 *
 * Dry-run by default. Execute requires an explicit confirm token.
 * Do not add a unique (workspaceId, customerId) index until production merge
 * has been approved and run.
 */
import type { LeadIntent, LeadSource, PrismaClient } from "@prisma/client";
import {
  finalizeWritableLeadClassification,
  resolveDisplayedLeadClassification,
} from "@/lib/agent/lead-classification";

export const EXECUTE_LEAD_DUPLICATE_RECONCILIATION =
  "EXECUTE_LEAD_DUPLICATE_RECONCILIATION" as const;

/**
 * Every Lead-owned / leadId column discovered in prisma/schema.prisma.
 * SmsSuppression is workspace+phone (not Lead-owned) and is not moved.
 */
export const LEAD_DUPLICATE_FK_AUDIT = [
  { model: "LeadActivity", field: "leadId", unique: false },
  { model: "Appointment", field: "leadId", unique: false },
  { model: "ViewingTour", field: "leadId", unique: false },
  { model: "AgentTask", field: "leadId", unique: false },
  { model: "LeadNote", field: "leadId", unique: false },
  { model: "LeadEmailLog", field: "leadId", unique: false },
  { model: "CmaReport", field: "leadId", unique: false },
  { model: "LeadTag", field: "leadId", unique: "workspaceId+leadId+tagId" },
  { model: "LeadOrigin", field: "leadId", unique: "leadId" },
  { model: "LeadImportRow", field: "leadId", unique: false },
  { model: "Conversation", field: "leadId", unique: "workspaceId+leadId" },
  { model: "Message", field: "leadId", unique: false, note: "denormalized" },
  { model: "ConsentEvent", field: "leadId", unique: false, note: "no Prisma Lead relation" },
  { model: "ReferralHandoff", field: "leadId", unique: false, note: "no Prisma Lead relation" },
  { model: "OutboundSmsDeadLetter", field: "leadId", unique: false },
  { model: "SmsMassBatchRecipient", field: "leadId", unique: "batchId+leadId" },
  { model: "SmsAutomationDispatch", field: "leadId", unique: "workspace+lead+key+cycle" },
] as const;

export type LeadDuplicateMoveCounts = {
  activities: number;
  appointments: number;
  viewingTours: number;
  tasks: number;
  notes: number;
  emailLogs: number;
  cmaReports: number;
  tagsMoved: number;
  tagsSkippedDuplicate: number;
  importRows: number;
  conversationsMerged: number;
  messagesMoved: number;
  consentEvents: number;
  referralHandoffs: number;
  smsMassRecipientsMoved: number;
  smsMassRecipientsSkipped: number;
  smsAutomationMoved: number;
  smsAutomationSkipped: number;
  outboundSmsDeadLetters: number;
  originsKeptCanonical: number;
  originsDroppedDuplicate: number;
  originsMoved: number;
};

export type LeadDuplicateMember = {
  id: string;
  source: LeadSource;
  status: string;
  isBuyer: boolean;
  isSeller: boolean;
  assignedAgentId: string | null;
  assignedAgentEmail: string | null;
  createdAt: string;
};

export type LeadDuplicateGroupPlan = {
  workspaceId: string;
  customerId: string;
  customerLabel: string;
  canonicalLeadId: string;
  canonicalCreatedAt: string;
  survivingAgentId: string | null;
  survivingAgentEmail: string | null;
  duplicateLeadIds: string[];
  before: {
    leads: LeadDuplicateMember[];
  };
  after: {
    leadId: string;
    isBuyer: boolean;
    isSeller: boolean;
    intent: LeadIntent;
    assignedAgentId: string | null;
    assignedAgentEmail: string | null;
    source: LeadSource;
  };
  moves: LeadDuplicateMoveCounts;
};

type LeadRow = {
  id: string;
  workspaceId: string | null;
  customerId: string | null;
  assignedAgentId: string | null;
  source: LeadSource;
  status: string;
  intent: LeadIntent;
  isBuyer: boolean | null;
  isSeller: boolean | null;
  notes: string | null;
  listingMls: string | null;
  inquiryTag: string | null;
  score: number;
  firstRespondedAt: Date | null;
  contactConsentAt: Date | null;
  createdAt: Date;
  assignedAgent: { id: string; email: string } | null;
  customer: { name: string | null; email: string } | null;
};

export function pickCanonicalDuplicateLead<T extends { id: string; createdAt: Date | string }>(
  leads: T[],
): T {
  return [...leads].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    if (aTime !== bTime) return aTime - bTime;
    return a.id.localeCompare(b.id);
  })[0]!;
}

function emptyMoves(): LeadDuplicateMoveCounts {
  return {
    activities: 0,
    appointments: 0,
    viewingTours: 0,
    tasks: 0,
    notes: 0,
    emailLogs: 0,
    cmaReports: 0,
    tagsMoved: 0,
    tagsSkippedDuplicate: 0,
    importRows: 0,
    conversationsMerged: 0,
    messagesMoved: 0,
    consentEvents: 0,
    referralHandoffs: 0,
    smsMassRecipientsMoved: 0,
    smsMassRecipientsSkipped: 0,
    smsAutomationMoved: 0,
    smsAutomationSkipped: 0,
    outboundSmsDeadLetters: 0,
    originsKeptCanonical: 0,
    originsDroppedDuplicate: 0,
    originsMoved: 0,
  };
}

function displayedFlags(lead: LeadRow) {
  return resolveDisplayedLeadClassification({
    isBuyer: lead.isBuyer,
    isSeller: lead.isSeller,
    intent: lead.intent,
  });
}

async function countWhere(
  fn: ((args: { where: Record<string, unknown> }) => Promise<number>) | undefined,
  where: Record<string, unknown>,
): Promise<number> {
  if (!fn) return 0;
  return fn({ where });
}

export type LeadDuplicateReconciliationDb = Pick<
  PrismaClient,
  | "lead"
  | "leadActivity"
  | "appointment"
  | "viewingTour"
  | "agentTask"
  | "leadNote"
  | "leadEmailLog"
  | "cmaReport"
  | "leadTag"
  | "leadOrigin"
  | "leadImportRow"
  | "conversation"
  | "message"
  | "consentEvent"
  | "referralHandoff"
  | "smsMassBatchRecipient"
  | "smsAutomationDispatch"
  | "outboundSmsDeadLetter"
>;

async function planMovesForDuplicates(
  db: LeadDuplicateReconciliationDb,
  canonicalId: string,
  duplicateIds: string[],
  workspaceId: string,
): Promise<LeadDuplicateMoveCounts> {
  const moves = emptyMoves();
  if (duplicateIds.length === 0) return moves;
  const inDup = { leadId: { in: duplicateIds } };

  moves.activities = await countWhere(db.leadActivity.count.bind(db.leadActivity), inDup);
  moves.appointments = await countWhere(db.appointment.count.bind(db.appointment), inDup);
  moves.viewingTours = await countWhere(db.viewingTour.count.bind(db.viewingTour), inDup);
  moves.tasks = await countWhere(db.agentTask.count.bind(db.agentTask), inDup);
  moves.notes = await countWhere(db.leadNote.count.bind(db.leadNote), inDup);
  moves.emailLogs = await countWhere(db.leadEmailLog.count.bind(db.leadEmailLog), inDup);
  moves.cmaReports = await countWhere(db.cmaReport.count.bind(db.cmaReport), inDup);
  moves.importRows = await countWhere(db.leadImportRow.count.bind(db.leadImportRow), inDup);
  moves.consentEvents = await countWhere(db.consentEvent.count.bind(db.consentEvent), inDup);
  moves.referralHandoffs = await countWhere(
    db.referralHandoff.count.bind(db.referralHandoff),
    inDup,
  );
  moves.outboundSmsDeadLetters = await countWhere(
    db.outboundSmsDeadLetter.count.bind(db.outboundSmsDeadLetter),
    inDup,
  );

  const canonicalTags = await db.leadTag.findMany({
    where: { leadId: canonicalId },
    select: { tagId: true },
  });
  const canonicalTagIds = new Set(canonicalTags.map((row) => row.tagId));
  const dupTags = await db.leadTag.findMany({
    where: { leadId: { in: duplicateIds } },
    select: { tagId: true },
  });
  for (const tag of dupTags) {
    if (canonicalTagIds.has(tag.tagId)) moves.tagsSkippedDuplicate += 1;
    else {
      moves.tagsMoved += 1;
      canonicalTagIds.add(tag.tagId);
    }
  }

  const canonicalOrigin = await db.leadOrigin.findUnique({
    where: { leadId: canonicalId },
    select: { leadId: true },
  });
  const dupOrigins = await db.leadOrigin.findMany({
    where: { leadId: { in: duplicateIds } },
    select: { leadId: true },
  });
  if (canonicalOrigin) {
    moves.originsKeptCanonical = 1;
    moves.originsDroppedDuplicate = dupOrigins.length;
  } else if (dupOrigins.length > 0) {
    moves.originsMoved = 1;
    moves.originsDroppedDuplicate = Math.max(0, dupOrigins.length - 1);
  }

  const canonicalConvo = await db.conversation.findFirst({
    where: { workspaceId, leadId: canonicalId },
    select: { id: true },
  });
  const dupConvos = await db.conversation.findMany({
    where: { workspaceId, leadId: { in: duplicateIds } },
    select: { id: true },
  });
  const convoIds = dupConvos.map((row) => row.id);
  if (dupConvos.length > 0) {
    moves.conversationsMerged = canonicalConvo ? dupConvos.length : Math.max(0, dupConvos.length - 1);
  }
  if (convoIds.length > 0) {
    moves.messagesMoved = await db.message.count({
      where: { conversationId: { in: convoIds } },
    });
  }
  const orphanMessages = await db.message.count({
    where: { leadId: { in: duplicateIds }, conversationId: { notIn: convoIds.length ? convoIds : ["__none__"] } },
  });
  moves.messagesMoved += orphanMessages;

  const canonicalMass = await db.smsMassBatchRecipient.findMany({
    where: { leadId: canonicalId },
    select: { batchId: true },
  });
  const canonicalBatches = new Set(canonicalMass.map((row) => row.batchId));
  const dupMass = await db.smsMassBatchRecipient.findMany({
    where: { leadId: { in: duplicateIds } },
    select: { batchId: true },
  });
  for (const row of dupMass) {
    if (canonicalBatches.has(row.batchId)) moves.smsMassRecipientsSkipped += 1;
    else {
      moves.smsMassRecipientsMoved += 1;
      canonicalBatches.add(row.batchId);
    }
  }

  const canonicalAuto = await db.smsAutomationDispatch.findMany({
    where: { leadId: canonicalId },
    select: { automationKey: true, cycleKey: true },
  });
  const autoKeys = new Set(
    canonicalAuto.map((row) => `${row.automationKey}::${row.cycleKey}`),
  );
  const dupAuto = await db.smsAutomationDispatch.findMany({
    where: { leadId: { in: duplicateIds } },
    select: { automationKey: true, cycleKey: true },
  });
  for (const row of dupAuto) {
    const key = `${row.automationKey}::${row.cycleKey}`;
    if (autoKeys.has(key)) moves.smsAutomationSkipped += 1;
    else {
      moves.smsAutomationMoved += 1;
      autoKeys.add(key);
    }
  }

  return moves;
}

export async function planLeadDuplicateReconciliation(
  db: LeadDuplicateReconciliationDb,
  options?: { workspaceId?: string; customerId?: string },
): Promise<LeadDuplicateGroupPlan[]> {
  const leads = (await db.lead.findMany({
    where: {
      customerId: options?.customerId
        ? options.customerId
        : { not: null },
      workspaceId: options?.workspaceId
        ? options.workspaceId
        : { not: null },
    },
    select: {
      id: true,
      workspaceId: true,
      customerId: true,
      assignedAgentId: true,
      source: true,
      status: true,
      intent: true,
      isBuyer: true,
      isSeller: true,
      notes: true,
      listingMls: true,
      inquiryTag: true,
      score: true,
      firstRespondedAt: true,
      contactConsentAt: true,
      createdAt: true,
      assignedAgent: { select: { id: true, email: true } },
      customer: { select: { name: true, email: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })) as LeadRow[];

  const groups = new Map<string, LeadRow[]>();
  for (const lead of leads) {
    if (!lead.workspaceId || !lead.customerId) continue;
    const key = `${lead.workspaceId}::${lead.customerId}`;
    const list = groups.get(key) ?? [];
    list.push(lead);
    groups.set(key, list);
  }

  const plans: LeadDuplicateGroupPlan[] = [];
  for (const [, members] of groups) {
    if (members.length < 2) continue;
    const canonical = pickCanonicalDuplicateLead(members);
    const duplicates = members.filter((row) => row.id !== canonical.id);
    const flags = finalizeWritableLeadClassification({
      isBuyer: members.some((row) => displayedFlags(row).isBuyer),
      isSeller: members.some((row) => displayedFlags(row).isSeller),
    });
    const moves = await planMovesForDuplicates(
      db,
      canonical.id,
      duplicates.map((row) => row.id),
      canonical.workspaceId!,
    );

    plans.push({
      workspaceId: canonical.workspaceId!,
      customerId: canonical.customerId!,
      customerLabel:
        canonical.customer?.name?.trim() ||
        canonical.customer?.email ||
        canonical.customerId!,
      canonicalLeadId: canonical.id,
      canonicalCreatedAt: canonical.createdAt.toISOString(),
      survivingAgentId: canonical.assignedAgentId,
      survivingAgentEmail: canonical.assignedAgent?.email ?? null,
      duplicateLeadIds: duplicates.map((row) => row.id),
      before: {
        leads: members.map((row) => {
          const shown = displayedFlags(row);
          return {
            id: row.id,
            source: row.source,
            status: row.status,
            isBuyer: shown.isBuyer,
            isSeller: shown.isSeller,
            assignedAgentId: row.assignedAgentId,
            assignedAgentEmail: row.assignedAgent?.email ?? null,
            createdAt: row.createdAt.toISOString(),
          };
        }),
      },
      after: {
        leadId: canonical.id,
        isBuyer: flags.isBuyer,
        isSeller: flags.isSeller,
        intent: flags.intent,
        assignedAgentId: canonical.assignedAgentId,
        assignedAgentEmail: canonical.assignedAgent?.email ?? null,
        source: canonical.source,
      },
      moves,
    });
  }

  return plans.sort((a, b) =>
    a.workspaceId === b.workspaceId
      ? a.customerLabel.localeCompare(b.customerLabel)
      : a.workspaceId.localeCompare(b.workspaceId),
  );
}

async function repoint(
  fn: ((args: {
    where: { leadId: { in: string[] } };
    data: { leadId: string };
  }) => Promise<{ count: number }>) | undefined,
  duplicateIds: string[],
  canonicalId: string,
): Promise<void> {
  if (!fn || duplicateIds.length === 0) return;
  await fn({
    where: { leadId: { in: duplicateIds } },
    data: { leadId: canonicalId },
  });
}

export async function executeLeadDuplicateReconciliation(
  db: LeadDuplicateReconciliationDb,
  input: {
    confirm: typeof EXECUTE_LEAD_DUPLICATE_RECONCILIATION;
    plans: LeadDuplicateGroupPlan[];
  },
): Promise<{ mergedGroups: number; deletedLeads: number }> {
  if (input.confirm !== EXECUTE_LEAD_DUPLICATE_RECONCILIATION) {
    throw new Error("Refusing to execute duplicate reconciliation without confirm token");
  }

  let deletedLeads = 0;
  for (const plan of input.plans) {
    const canonicalId = plan.canonicalLeadId;
    const duplicateIds = plan.duplicateLeadIds;
    if (duplicateIds.length === 0) continue;
    const workspaceId = plan.workspaceId;

    const canonical = await db.lead.findUnique({
      where: { id: canonicalId },
      select: {
        id: true,
        notes: true,
        listingMls: true,
        inquiryTag: true,
        score: true,
        firstRespondedAt: true,
        contactConsentAt: true,
        source: true,
        assignedAgentId: true,
      },
    });
    if (!canonical) continue;

    const dupRows = await db.lead.findMany({
      where: { id: { in: duplicateIds } },
      select: {
        notes: true,
        listingMls: true,
        inquiryTag: true,
        score: true,
        firstRespondedAt: true,
        contactConsentAt: true,
      },
    });

    const mergedNotes = [canonical.notes, ...dupRows.map((row) => row.notes)]
      .filter((value): value is string => Boolean(value?.trim()))
      .filter((value, index, all) => all.indexOf(value) === index)
      .join("\n\n");
    const firstResponded = [canonical.firstRespondedAt, ...dupRows.map((row) => row.firstRespondedAt)]
      .filter((value): value is Date => value instanceof Date)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const consent = [canonical.contactConsentAt, ...dupRows.map((row) => row.contactConsentAt)]
      .filter((value): value is Date => value instanceof Date)
      .sort((a, b) => a.getTime() - b.getTime())[0];

    await db.lead.update({
      where: { id: canonicalId },
      data: {
        isBuyer: plan.after.isBuyer,
        isSeller: plan.after.isSeller,
        intent: plan.after.intent,
        assignedAgentId: canonical.assignedAgentId,
        source: canonical.source,
        notes: mergedNotes || canonical.notes,
        listingMls:
          canonical.listingMls ||
          dupRows.find((row) => row.listingMls)?.listingMls ||
          null,
        inquiryTag:
          canonical.inquiryTag ||
          dupRows.find((row) => row.inquiryTag)?.inquiryTag ||
          null,
        score: Math.max(canonical.score, ...dupRows.map((row) => row.score)),
        ...(firstResponded ? { firstRespondedAt: firstResponded } : {}),
        ...(consent && !canonical.contactConsentAt
          ? { contactConsentAt: consent }
          : {}),
      },
    });

    await repoint(db.leadActivity.updateMany.bind(db.leadActivity), duplicateIds, canonicalId);
    await repoint(db.appointment.updateMany.bind(db.appointment), duplicateIds, canonicalId);
    await repoint(db.viewingTour.updateMany.bind(db.viewingTour), duplicateIds, canonicalId);
    await repoint(db.agentTask.updateMany.bind(db.agentTask), duplicateIds, canonicalId);
    await repoint(db.leadNote.updateMany.bind(db.leadNote), duplicateIds, canonicalId);
    await repoint(db.leadEmailLog.updateMany.bind(db.leadEmailLog), duplicateIds, canonicalId);
    await repoint(db.cmaReport.updateMany.bind(db.cmaReport), duplicateIds, canonicalId);
    await repoint(db.leadImportRow.updateMany.bind(db.leadImportRow), duplicateIds, canonicalId);
    await repoint(db.consentEvent.updateMany.bind(db.consentEvent), duplicateIds, canonicalId);
    await repoint(db.referralHandoff.updateMany.bind(db.referralHandoff), duplicateIds, canonicalId);
    await repoint(
      db.outboundSmsDeadLetter.updateMany.bind(db.outboundSmsDeadLetter),
      duplicateIds,
      canonicalId,
    );

    const canonicalTagIds = new Set(
      (
        await db.leadTag.findMany({
          where: { leadId: canonicalId },
          select: { tagId: true },
        })
      ).map((row) => row.tagId),
    );
    const dupTags = await db.leadTag.findMany({
      where: { leadId: { in: duplicateIds } },
      select: { id: true, tagId: true },
    });
    for (const tag of dupTags) {
      if (canonicalTagIds.has(tag.tagId)) {
        await db.leadTag.delete({ where: { id: tag.id } });
      } else {
        await db.leadTag.update({
          where: { id: tag.id },
          data: { leadId: canonicalId },
        });
        canonicalTagIds.add(tag.tagId);
      }
    }

    const canonicalOrigin = await db.leadOrigin.findUnique({
      where: { leadId: canonicalId },
      select: { leadId: true },
    });
    const dupOrigins = await db.leadOrigin.findMany({
      where: { leadId: { in: duplicateIds } },
      select: { leadId: true },
    });
    if (!canonicalOrigin && dupOrigins[0]) {
      await db.leadOrigin.update({
        where: { leadId: dupOrigins[0].leadId },
        data: { leadId: canonicalId, workspaceId },
      });
      dupOrigins.shift();
    }
    for (const origin of dupOrigins) {
      await db.leadOrigin.delete({ where: { leadId: origin.leadId } });
    }

    const canonicalConvo = await db.conversation.findFirst({
      where: { workspaceId, leadId: canonicalId },
      select: { id: true, lastMessageAt: true },
    });
    const dupConvos = await db.conversation.findMany({
      where: { workspaceId, leadId: { in: duplicateIds } },
      select: { id: true, lastMessageAt: true },
    });
    let survivorConvoId = canonicalConvo?.id ?? null;
    if (!survivorConvoId && dupConvos[0]) {
      await db.conversation.update({
        where: { id: dupConvos[0].id },
        data: { leadId: canonicalId },
      });
      survivorConvoId = dupConvos[0].id;
      dupConvos.shift();
    }
    for (const convo of dupConvos) {
      if (survivorConvoId) {
        await db.message.updateMany({
          where: { conversationId: convo.id },
          data: { conversationId: survivorConvoId, leadId: canonicalId },
        });
        await db.conversation.delete({ where: { id: convo.id } });
      }
    }
    await db.message.updateMany({
      where: { leadId: { in: duplicateIds } },
      data: { leadId: canonicalId },
    });

    const canonicalBatches = new Set(
      (
        await db.smsMassBatchRecipient.findMany({
          where: { leadId: canonicalId },
          select: { batchId: true },
        })
      ).map((row) => row.batchId),
    );
    const dupMass = await db.smsMassBatchRecipient.findMany({
      where: { leadId: { in: duplicateIds } },
      select: { id: true, batchId: true },
    });
    for (const row of dupMass) {
      if (canonicalBatches.has(row.batchId)) {
        await db.smsMassBatchRecipient.delete({ where: { id: row.id } });
      } else {
        await db.smsMassBatchRecipient.update({
          where: { id: row.id },
          data: { leadId: canonicalId },
        });
        canonicalBatches.add(row.batchId);
      }
    }

    const autoKeys = new Set(
      (
        await db.smsAutomationDispatch.findMany({
          where: { leadId: canonicalId },
          select: { automationKey: true, cycleKey: true },
        })
      ).map((row) => `${row.automationKey}::${row.cycleKey}`),
    );
    const dupAuto = await db.smsAutomationDispatch.findMany({
      where: { leadId: { in: duplicateIds } },
      select: { id: true, automationKey: true, cycleKey: true },
    });
    for (const row of dupAuto) {
      const key = `${row.automationKey}::${row.cycleKey}`;
      if (autoKeys.has(key)) {
        await db.smsAutomationDispatch.delete({ where: { id: row.id } });
      } else {
        await db.smsAutomationDispatch.update({
          where: { id: row.id },
          data: { leadId: canonicalId },
        });
        autoKeys.add(key);
      }
    }

    await db.lead.deleteMany({ where: { id: { in: duplicateIds } } });
    deletedLeads += duplicateIds.length;
  }

  return { mergedGroups: input.plans.length, deletedLeads };
}
