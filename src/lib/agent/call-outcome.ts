import { z } from "zod";
import type { AgentOrgContext } from "@/lib/agent";
import { CALL_NEW_LEAD_TASK_TITLE } from "@/lib/agent/lead-intake";
import {
  recordCustomerContactUpdateRequest,
  type ContactUpdateChannel,
} from "@/lib/agent/contact-update-request";
import { CALL_OUTCOME_ACTIVITY_LABEL } from "@/lib/agent/call-outcome-presentation";
import { canAccessLead as defaultCanAccessLead } from "@/lib/crm-read-scope";
import { resolveChildCrmOwnership } from "@/lib/crm-ownership";

export const CALL_OUTCOME_FOLLOW_UP_TITLE = "Call follow-up";

export const CALL_OUTCOMES = [
  "SPOKE_TO_LEAD",
  "LEFT_VOICEMAIL",
  "INVALID_NUMBER",
  "WRONG_NUMBER",
] as const;

export type CallOutcome = (typeof CALL_OUTCOMES)[number];

const callOutcomeSchema = z
  .object({
    leadId: z.string().min(1),
    outcome: z.enum(CALL_OUTCOMES),
    note: z.string().max(8000).optional(),
    followUpDueAt: z.string().min(1).optional(),
    clientRequestId: z.string().trim().min(8).max(128),
  })
  .strict();

export type CallOutcomeRequest = z.infer<typeof callOutcomeSchema>;

type ContactNotice = {
  customerId: string;
  leadId: string;
  channel: ContactUpdateChannel;
  actorUserId: string;
};

export type CallOutcomeResult = {
  ok: true;
  replayed: boolean;
  outcome: CallOutcome;
  activityId: string;
  noteId: string | null;
  followUpTaskId: string | null;
  contactUpdateRequested: boolean;
  notice: ContactNotice | null;
};

type LeadRow = {
  id: string;
  organizationId: string | null;
  workspaceId: string | null;
  assignedAgentId: string | null;
  customerId: string | null;
  notes: string | null;
  status: string;
  firstRespondedAt: Date | null;
};

type ActivityMeta = {
  outcome: CallOutcome;
  clientRequestId: string;
  noteId: string | null;
  followUpTaskId: string | null;
  contactUpdateRequested: boolean;
};

type CallOutcomeTx = {
  $executeRaw: (
    query: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown>;
  lead: {
    findUnique: (args: {
      where: { id: string };
      select: { notes: true };
    }) => Promise<{ notes: string | null } | null>;
    update: (args: {
      where: { id: string };
      data: {
        notes: string;
        organizationId: string;
        workspaceId?: string;
      };
    }) => Promise<unknown>;
    updateMany: (args: {
      where: {
        id: string;
        firstRespondedAt: null;
        status: "ATTEMPTED_CONTACT";
      };
      data: { firstRespondedAt: Date };
    }) => Promise<unknown>;
  };
  leadNote: {
    create: (args: {
      data: {
        organizationId: string;
        workspaceId?: string;
        leadId: string;
        authorId: string;
        body: string;
        category: "CALL";
        pinned: false;
        pinnedAt: null;
      };
    }) => Promise<{ id: string }>;
  };
  leadActivity: {
    findFirst: (args: {
      where: {
        leadId: string;
        type: "CALL";
        meta: { path: ["clientRequestId"]; equals: string };
      };
      select: { id: true; meta: true };
    }) => Promise<{ id: string; meta: unknown } | null>;
    create: (args: {
      data: {
        leadId: string;
        userId: string;
        type: "CALL" | "contact_update_request";
        body: string;
        meta: Record<string, unknown>;
      };
    }) => Promise<{ id: string }>;
  };
  agentTask: {
    create: (args: {
      data: {
        organizationId: string;
        workspaceId?: string;
        leadId: string;
        assigneeId: string;
        createdById: string;
        type: "CALL";
        status: "OPEN";
        title: string;
        body: string;
        dueAt: Date;
      };
    }) => Promise<{ id: string }>;
    updateMany: (args: {
      where: { leadId: string; status: "OPEN"; title: string };
      data: { status: "DONE"; completedAt: Date };
    }) => Promise<unknown>;
  };
  user: {
    update: (args: {
      where: { id: string };
      data: {
        phoneUpdateRequestedAt?: Date;
        emailUpdateRequestedAt?: Date;
        phoneVerifiedAt?: null;
      };
    }) => Promise<unknown>;
  };
};

export type CallOutcomeDb = {
  lead: {
    findUnique: (args: {
      where: { id: string };
    }) => Promise<LeadRow | null>;
  };
  $transaction: <T>(fn: (tx: CallOutcomeTx) => Promise<T>) => Promise<T>;
};

type Ownership = { organizationId: string; workspaceId?: string };

function outcomeBody(outcome: CallOutcome): string {
  switch (outcome) {
    case "SPOKE_TO_LEAD":
      return CALL_OUTCOME_ACTIVITY_LABEL.SPOKE_TO_LEAD;
    case "LEFT_VOICEMAIL":
      return CALL_OUTCOME_ACTIVITY_LABEL.LEFT_VOICEMAIL;
    case "INVALID_NUMBER":
      return CALL_OUTCOME_ACTIVITY_LABEL.INVALID_NUMBER;
    case "WRONG_NUMBER":
      return CALL_OUTCOME_ACTIVITY_LABEL.WRONG_NUMBER;
    default: {
      const unreachable: never = outcome;
      return unreachable;
    }
  }
}

function allowsNoteAndFollowUp(outcome: CallOutcome): boolean {
  return outcome === "SPOKE_TO_LEAD" || outcome === "LEFT_VOICEMAIL";
}

function isNumberCorrection(outcome: CallOutcome): boolean {
  return outcome === "INVALID_NUMBER" || outcome === "WRONG_NUMBER";
}

function readStoredMeta(meta: unknown): ActivityMeta | null {
  if (!meta || typeof meta !== "object") return null;
  const row = meta as Partial<ActivityMeta>;
  if (typeof row.outcome !== "string" || typeof row.clientRequestId !== "string") {
    return null;
  }
  if (!CALL_OUTCOMES.includes(row.outcome as CallOutcome)) return null;
  return {
    outcome: row.outcome as CallOutcome,
    clientRequestId: row.clientRequestId,
    noteId: typeof row.noteId === "string" ? row.noteId : null,
    followUpTaskId:
      typeof row.followUpTaskId === "string" ? row.followUpTaskId : null,
    contactUpdateRequested: row.contactUpdateRequested === true,
  };
}

function legacyNoteLine(input: {
  body: string;
  actorName: string;
  at: Date;
}): string {
  const stamp = input.at.toLocaleString("en-CA");
  return `[${stamp}] [Call] ${input.actorName}: ${input.body}`;
}

async function findCompletedRequest(
  tx: CallOutcomeTx,
  leadId: string,
  clientRequestId: string,
): Promise<{ id: string; meta: ActivityMeta } | null> {
  const existing = await tx.leadActivity.findFirst({
    where: {
      leadId,
      type: "CALL",
      meta: { path: ["clientRequestId"], equals: clientRequestId },
    },
    select: { id: true, meta: true },
  });
  if (!existing) return null;
  const meta = readStoredMeta(existing.meta);
  if (!meta || meta.clientRequestId !== clientRequestId) return null;
  return { id: existing.id, meta };
}

function replayResult(found: { id: string; meta: ActivityMeta }): CallOutcomeResult {
  return {
    ok: true,
    replayed: true,
    outcome: found.meta.outcome,
    activityId: found.id,
    noteId: found.meta.noteId,
    followUpTaskId: found.meta.followUpTaskId,
    contactUpdateRequested: found.meta.contactUpdateRequested,
    notice: null,
  };
}

export async function postAgentCallOutcome(
  request: Request,
  deps: {
    requireAgentContext: () => Promise<AgentOrgContext | null>;
    canAccessLead?: typeof defaultCanAccessLead;
    db: CallOutcomeDb;
    resolveOwnership?: (input: {
      organizationId: string;
      leadId: string;
      leadWorkspaceId: string | null;
    }) => Promise<Ownership>;
    now?: () => Date;
  },
): Promise<
  { ok: false; response: Response } | { ok: true; saved: CallOutcomeResult }
> {
  const ctx = await deps.requireAgentContext();
  if (!ctx) {
    return {
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "Invalid payload" }, { status: 400 }),
    };
  }

  const parsed = callOutcomeSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      response: Response.json({ error: "Invalid payload" }, { status: 400 }),
    };
  }

  const note = parsed.data.note?.trim() ?? "";
  let followUpDueAt: Date | null = null;
  if (parsed.data.followUpDueAt) {
    followUpDueAt = new Date(parsed.data.followUpDueAt);
    if (Number.isNaN(followUpDueAt.getTime())) {
      return {
        ok: false,
        response: Response.json({ error: "Invalid payload" }, { status: 400 }),
      };
    }
  }

  if (
    !allowsNoteAndFollowUp(parsed.data.outcome) &&
    (note.length > 0 || followUpDueAt)
  ) {
    return {
      ok: false,
      response: Response.json(
        { error: "Note and follow-up apply only to spoke and voicemail outcomes" },
        { status: 400 },
      ),
    };
  }

  const lead = await deps.db.lead.findUnique({
    where: { id: parsed.data.leadId },
  });
  const canAccess = deps.canAccessLead ?? defaultCanAccessLead;
  if (!lead || !canAccess(ctx, lead)) {
    return {
      ok: false,
      response: Response.json({ error: "Not found" }, { status: 404 }),
    };
  }
  if (isNumberCorrection(parsed.data.outcome) && !lead.customerId) {
    return {
      ok: false,
      response: Response.json({ error: "Not found" }, { status: 404 }),
    };
  }

  const organizationId = lead.organizationId ?? ctx.organizationId;
  const resolveOwnership = deps.resolveOwnership ?? resolveChildCrmOwnership;
  const ownership = await resolveOwnership({
    organizationId,
    leadId: lead.id,
    leadWorkspaceId: lead.workspaceId,
  });

  const now = deps.now?.() ?? new Date();
  const saved = await deps.db.$transaction((tx) =>
    writeCallOutcome(tx, {
      lead,
      actor: ctx.user,
      ownership,
      outcome: parsed.data.outcome,
      note,
      followUpDueAt,
      clientRequestId: parsed.data.clientRequestId,
      now,
    }),
  );

  return { ok: true, saved };
}

export function callOutcomeHttpResponse(saved: CallOutcomeResult): Response {
  return Response.json({
    ok: true,
    replayed: saved.replayed,
    outcome: saved.outcome,
    activityId: saved.activityId,
    noteId: saved.noteId,
    followUpTaskId: saved.followUpTaskId,
    contactUpdateRequested: saved.contactUpdateRequested,
  });
}

export function deliverCallOutcomeNotice(
  saved: CallOutcomeResult,
  notify: (input: NonNullable<CallOutcomeResult["notice"]>) => void,
): void {
  if (!saved.notice || saved.replayed) return;
  try {
    notify(saved.notice);
  } catch (error) {
    console.error("[call-outcome] contact update notice failed", error);
  }
}

async function writeCallOutcome(
  tx: CallOutcomeTx,
  input: {
    lead: LeadRow;
    actor: { id: string; name: string | null; email: string };
    ownership: Ownership;
    outcome: CallOutcome;
    note: string;
    followUpDueAt: Date | null;
    clientRequestId: string;
    now: Date;
  },
): Promise<CallOutcomeResult> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtext(${input.lead.id}), hashtext(${input.clientRequestId}))
  `;

  const already = await findCompletedRequest(
    tx,
    input.lead.id,
    input.clientRequestId,
  );
  if (already) return replayResult(already);

  let noteId: string | null = null;
  if (input.note) {
    const note = await tx.leadNote.create({
      data: {
        organizationId: input.ownership.organizationId,
        workspaceId: input.ownership.workspaceId,
        leadId: input.lead.id,
        authorId: input.actor.id,
        body: input.note,
        category: "CALL",
        pinned: false,
        pinnedAt: null,
      },
    });
    noteId = note.id;
    const current = await tx.lead.findUnique({
      where: { id: input.lead.id },
      select: { notes: true },
    });
    const line = legacyNoteLine({
      body: input.note,
      actorName: input.actor.name || input.actor.email,
      at: input.now,
    });
    await tx.lead.update({
      where: { id: input.lead.id },
      data: {
        notes: current?.notes ? `${current.notes}\n\n${line}` : line,
        organizationId: input.ownership.organizationId,
        workspaceId: input.ownership.workspaceId,
      },
    });
  }

  let followUpTaskId: string | null = null;
  if (input.followUpDueAt) {
    const task = await tx.agentTask.create({
      data: {
        organizationId: input.ownership.organizationId,
        workspaceId: input.ownership.workspaceId,
        leadId: input.lead.id,
        assigneeId: input.lead.assignedAgentId ?? input.actor.id,
        createdById: input.actor.id,
        type: "CALL",
        status: "OPEN",
        title: CALL_OUTCOME_FOLLOW_UP_TITLE,
        body: "Follow up from a logged call.",
        dueAt: input.followUpDueAt,
      },
    });
    followUpTaskId = task.id;
  }

  await tx.agentTask.updateMany({
    where: {
      leadId: input.lead.id,
      status: "OPEN",
      title: CALL_NEW_LEAD_TASK_TITLE,
    },
    data: { status: "DONE", completedAt: input.now },
  });

  const correction = isNumberCorrection(input.outcome);
  if (correction && input.lead.customerId) {
    await recordCustomerContactUpdateRequest(tx, {
      leadId: input.lead.id,
      customerId: input.lead.customerId,
      actorUserId: input.actor.id,
      channel: "phone",
      requestedAt: input.now,
    });
    await tx.user.update({
      where: { id: input.lead.customerId },
      data: { phoneVerifiedAt: null },
    });
  }

  const activity = await tx.leadActivity.create({
    data: {
      leadId: input.lead.id,
      userId: input.actor.id,
      type: "CALL",
      body: outcomeBody(input.outcome),
      meta: {
        outcome: input.outcome,
        clientRequestId: input.clientRequestId,
        noteId,
        followUpTaskId,
        contactUpdateRequested: correction,
      },
    },
  });

  await tx.lead.updateMany({
    where: {
      id: input.lead.id,
      firstRespondedAt: null,
      status: "ATTEMPTED_CONTACT",
    },
    data: { firstRespondedAt: input.now },
  });

  return {
    ok: true,
    replayed: false,
    outcome: input.outcome,
    activityId: activity.id,
    noteId,
    followUpTaskId,
    contactUpdateRequested: correction,
    notice:
      correction && input.lead.customerId
        ? {
            customerId: input.lead.customerId,
            leadId: input.lead.id,
            channel: "phone",
            actorUserId: input.actor.id,
          }
        : null,
  };
}
