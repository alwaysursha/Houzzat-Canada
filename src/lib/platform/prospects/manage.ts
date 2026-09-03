/**
 * Stage 6.6A — Master Admin PlatformProspect write service.
 * Sequential Prisma writes only — no $transaction().
 * Never touches tenant CRM (Lead / LeadNote / conversations).
 */

import type {
  PrismaClient,
  ProspectSource,
  ProspectStatus,
} from "@prisma/client";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import { prisma as defaultPrisma } from "@/lib/prisma";
import {
  PROSPECT_BROKERAGE_NAME_MAX,
  PROSPECT_BUSINESS_NAME_MAX,
  PROSPECT_CONTACT_NAME_MAX,
  PROSPECT_CONTACT_NAME_MIN,
  PROSPECT_DEMO_ACTIONS,
  PROSPECT_EMAIL_MAX,
  PROSPECT_NOTE_BODY_MAX,
  PROSPECT_NOTE_BODY_MIN,
  PROSPECT_NOTES_INTERNAL_MAX,
  PROSPECT_PHONE_MAX,
  PROSPECT_REGION_MAX,
  PROSPECT_SOURCES,
  PROSPECT_STATUSES,
  PROSPECT_TEAM_SIZE_MAX,
  PROSPECT_TEAM_SIZE_MIN,
  PROSPECT_WEBSITE_MAX,
  type ProspectDemoActionValue,
  type ProspectSourceValue,
  type ProspectStatusValue,
} from "./constants";
import { normalizeProspectEmail } from "./normalize-email";

export class PlatformProspectActionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = "PlatformProspectActionError";
    this.status = status;
    this.code = code;
  }
}

export type CreateOrReopenProspectResult =
  | {
      outcome: "created";
      prospectId: string;
      status: ProspectStatus;
      activityId: string;
      auditEventId: string;
    }
  | {
      outcome: "reopened";
      prospectId: string;
      fromStatus: ProspectStatus;
      toStatus: ProspectStatus;
      activityId: string;
      auditEventId: string;
    }
  | {
      outcome: "existing";
      prospectId: string;
      status: ProspectStatus;
    };

export type ProspectMutationResult = {
  outcome: "changed" | "no_op";
  prospectId: string;
  activityId?: string;
  auditEventId?: string;
  fromStatus?: ProspectStatus;
  toStatus?: ProspectStatus;
};

export type CreateProspectInput = {
  contactName: string;
  email: string;
  businessName?: string | null;
  phone?: string | null;
  brokerageName?: string | null;
  estimatedTeamSize?: number | null;
  region?: string | null;
  website?: string | null;
  source?: string | null;
  notesInternal?: string | null;
  operatorId: string;
  prisma?: PrismaClient;
};

export type UpdateProspectInput = {
  prospectId: string;
  operatorId: string;
  contactName?: string;
  email?: string;
  businessName?: string | null;
  phone?: string | null;
  brokerageName?: string | null;
  estimatedTeamSize?: number | null;
  region?: string | null;
  website?: string | null;
  source?: string | null;
  notesInternal?: string | null;
  prisma?: PrismaClient;
};

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function optionalTrimmed(
  raw: string | null | undefined,
  max: number,
  field: string,
): string | null {
  if (raw == null) return null;
  const value = raw.trim();
  if (!value) return null;
  if (value.length > max) {
    throw new PlatformProspectActionError(
      `${field} must be at most ${max} characters`,
      "INVALID_FIELD",
      400,
    );
  }
  return value;
}

export function validateContactName(raw: string): string {
  const value = raw.trim();
  if (value.length < PROSPECT_CONTACT_NAME_MIN) {
    throw new PlatformProspectActionError(
      "Contact name is required",
      "INVALID_CONTACT_NAME",
      400,
    );
  }
  if (value.length > PROSPECT_CONTACT_NAME_MAX) {
    throw new PlatformProspectActionError(
      `Contact name must be at most ${PROSPECT_CONTACT_NAME_MAX} characters`,
      "INVALID_CONTACT_NAME",
      400,
    );
  }
  return value;
}

export function validateProspectEmail(raw: string): string {
  const email = normalizeProspectEmail(raw);
  if (!email || email.length > PROSPECT_EMAIL_MAX || !EMAIL_SHAPE.test(email)) {
    throw new PlatformProspectActionError(
      "A valid email is required",
      "INVALID_EMAIL",
      400,
    );
  }
  return email;
}

export function validateProspectSource(
  raw: string | null | undefined,
): ProspectSource {
  if (raw == null || raw.trim() === "") return "WEBSITE_DEMO";
  const value = raw.trim().toUpperCase() as ProspectSourceValue;
  if (!(PROSPECT_SOURCES as readonly string[]).includes(value)) {
    throw new PlatformProspectActionError(
      "Invalid prospect source",
      "INVALID_SOURCE",
      400,
    );
  }
  return value;
}

export function validateProspectStatus(raw: string): ProspectStatus {
  const value = raw.trim().toUpperCase() as ProspectStatusValue;
  if (!(PROSPECT_STATUSES as readonly string[]).includes(value)) {
    throw new PlatformProspectActionError(
      "Invalid prospect status",
      "INVALID_STATUS",
      400,
    );
  }
  return value;
}

export function validateEstimatedTeamSize(
  raw: number | null | undefined,
): number | null {
  if (raw == null) return null;
  if (!Number.isInteger(raw) || raw < PROSPECT_TEAM_SIZE_MIN || raw > PROSPECT_TEAM_SIZE_MAX) {
    throw new PlatformProspectActionError(
      `Estimated team size must be an integer between ${PROSPECT_TEAM_SIZE_MIN} and ${PROSPECT_TEAM_SIZE_MAX}`,
      "INVALID_TEAM_SIZE",
      400,
    );
  }
  return raw;
}

export function validateWebsite(raw: string | null | undefined): string | null {
  const value = optionalTrimmed(raw, PROSPECT_WEBSITE_MAX, "Website");
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("bad protocol");
    }
  } catch {
    throw new PlatformProspectActionError(
      "Website must be a valid http(s) URL",
      "INVALID_WEBSITE",
      400,
    );
  }
  return value;
}

export function validateNotesInternal(
  raw: string | null | undefined,
): string | null {
  return optionalTrimmed(raw, PROSPECT_NOTES_INTERNAL_MAX, "Internal notes");
}

export function validateNoteBody(raw: string): string {
  const value = raw.trim();
  if (value.length < PROSPECT_NOTE_BODY_MIN) {
    throw new PlatformProspectActionError(
      "Note body is required",
      "INVALID_NOTE_BODY",
      400,
    );
  }
  if (value.length > PROSPECT_NOTE_BODY_MAX) {
    throw new PlatformProspectActionError(
      `Note body must be at most ${PROSPECT_NOTE_BODY_MAX} characters`,
      "INVALID_NOTE_BODY",
      400,
    );
  }
  return value;
}

export function validateScheduledAt(raw: string): Date {
  const trimmed = raw.trim();
  const date = new Date(trimmed);
  if (!trimmed || Number.isNaN(date.getTime())) {
    throw new PlatformProspectActionError(
      "A valid demo scheduledAt datetime is required",
      "INVALID_SCHEDULED_AT",
      400,
    );
  }
  return date;
}

export function validateDemoAction(raw: string): ProspectDemoActionValue {
  const value = raw.trim().toLowerCase() as ProspectDemoActionValue;
  if (!(PROSPECT_DEMO_ACTIONS as readonly string[]).includes(value)) {
    throw new PlatformProspectActionError(
      "Invalid demo action",
      "INVALID_DEMO_ACTION",
      400,
    );
  }
  return value;
}

function profileFieldsFromCreate(input: CreateProspectInput) {
  return {
    contactName: validateContactName(input.contactName),
    email: validateProspectEmail(input.email),
    businessName: optionalTrimmed(
      input.businessName,
      PROSPECT_BUSINESS_NAME_MAX,
      "Business name",
    ),
    phone: optionalTrimmed(input.phone, PROSPECT_PHONE_MAX, "Phone"),
    brokerageName: optionalTrimmed(
      input.brokerageName,
      PROSPECT_BROKERAGE_NAME_MAX,
      "Brokerage name",
    ),
    estimatedTeamSize: validateEstimatedTeamSize(input.estimatedTeamSize),
    region: optionalTrimmed(input.region, PROSPECT_REGION_MAX, "Region"),
    website: validateWebsite(input.website),
    source: validateProspectSource(input.source),
    notesInternal: validateNotesInternal(input.notesInternal),
  };
}

async function createStatusChangeActivity(
  db: PrismaClient,
  input: {
    prospectId: string;
    operatorId: string;
    fromStatus: ProspectStatus;
    toStatus: ProspectStatus;
  },
) {
  return db.platformProspectActivity.create({
    data: {
      prospectId: input.prospectId,
      type: "STATUS_CHANGE",
      operatorId: input.operatorId,
      body: `${input.fromStatus} → ${input.toStatus}`,
    },
    select: { id: true },
  });
}

export async function createOrReopenPlatformProspect(
  input: CreateProspectInput,
): Promise<CreateOrReopenProspectResult> {
  const db = input.prisma ?? defaultPrisma;
  const fields = profileFieldsFromCreate(input);

  const existing = await db.platformProspect.findUnique({
    where: { email: fields.email },
    select: { id: true, status: true },
  });

  if (existing && existing.status !== "LOST") {
    return {
      outcome: "existing",
      prospectId: existing.id,
      status: existing.status,
    };
  }

  if (existing && existing.status === "LOST") {
    const fromStatus = existing.status;
    await db.platformProspect.update({
      where: { id: existing.id },
      data: {
        ...fields,
        status: "NEW",
        ownerOperatorId: input.operatorId,
      },
    });

    const activity = await createStatusChangeActivity(db, {
      prospectId: existing.id,
      operatorId: input.operatorId,
      fromStatus,
      toStatus: "NEW",
    });

    const audit = await writePlatformAuditEvent(
      {
        actorOperatorId: input.operatorId,
        actorType: "OPERATOR",
        action: "PLATFORM_PROSPECT_STATUS_CHANGED",
        entityType: "PlatformProspect",
        entityId: existing.id,
        summary: `Prospect reopened (LOST → NEW)`,
        metadata: {
          prospectId: existing.id,
          fromStatus,
          toStatus: "NEW",
          reason: "reopen_lost",
        },
      },
      db,
    );

    return {
      outcome: "reopened",
      prospectId: existing.id,
      fromStatus,
      toStatus: "NEW",
      activityId: activity.id,
      auditEventId: audit.id,
    };
  }

  const created = await db.platformProspect.create({
    data: {
      ...fields,
      status: "NEW",
      ownerOperatorId: input.operatorId,
    },
    select: { id: true, status: true },
  });

  const activity = await db.platformProspectActivity.create({
    data: {
      prospectId: created.id,
      type: "NOTE",
      operatorId: input.operatorId,
      body: "Prospect created",
    },
    select: { id: true },
  });

  const audit = await writePlatformAuditEvent(
    {
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: "PLATFORM_PROSPECT_CREATED",
      entityType: "PlatformProspect",
      entityId: created.id,
      summary: `Prospect created for ${fields.email}`,
      metadata: {
        prospectId: created.id,
        email: fields.email,
        status: created.status,
        source: fields.source,
      },
    },
    db,
  );

  return {
    outcome: "created",
    prospectId: created.id,
    status: created.status,
    activityId: activity.id,
    auditEventId: audit.id,
  };
}

export async function updatePlatformProspect(
  input: UpdateProspectInput,
): Promise<ProspectMutationResult> {
  const db = input.prisma ?? defaultPrisma;
  const existing = await db.platformProspect.findUnique({
    where: { id: input.prospectId },
    select: {
      id: true,
      contactName: true,
      email: true,
      businessName: true,
      phone: true,
      brokerageName: true,
      estimatedTeamSize: true,
      region: true,
      website: true,
      source: true,
      notesInternal: true,
    },
  });
  if (!existing) {
    throw new PlatformProspectActionError("Prospect not found", "NOT_FOUND", 404);
  }

  const data: {
    contactName?: string;
    email?: string;
    businessName?: string | null;
    phone?: string | null;
    brokerageName?: string | null;
    estimatedTeamSize?: number | null;
    region?: string | null;
    website?: string | null;
    source?: ProspectSource;
    notesInternal?: string | null;
  } = {};

  if (input.contactName !== undefined) {
    data.contactName = validateContactName(input.contactName);
  }
  if (input.email !== undefined) {
    const email = validateProspectEmail(input.email);
    if (email !== existing.email) {
      const clash = await db.platformProspect.findUnique({
        where: { email },
        select: { id: true },
      });
      if (clash && clash.id !== existing.id) {
        throw new PlatformProspectActionError(
          "Another prospect already uses this email",
          "EMAIL_IN_USE",
          409,
        );
      }
      data.email = email;
    }
  }
  if (input.businessName !== undefined) {
    data.businessName = optionalTrimmed(
      input.businessName,
      PROSPECT_BUSINESS_NAME_MAX,
      "Business name",
    );
  }
  if (input.phone !== undefined) {
    data.phone = optionalTrimmed(input.phone, PROSPECT_PHONE_MAX, "Phone");
  }
  if (input.brokerageName !== undefined) {
    data.brokerageName = optionalTrimmed(
      input.brokerageName,
      PROSPECT_BROKERAGE_NAME_MAX,
      "Brokerage name",
    );
  }
  if (input.estimatedTeamSize !== undefined) {
    data.estimatedTeamSize = validateEstimatedTeamSize(input.estimatedTeamSize);
  }
  if (input.region !== undefined) {
    data.region = optionalTrimmed(input.region, PROSPECT_REGION_MAX, "Region");
  }
  if (input.website !== undefined) {
    data.website = validateWebsite(input.website);
  }
  if (input.source !== undefined) {
    data.source = validateProspectSource(input.source);
  }
  if (input.notesInternal !== undefined) {
    data.notesInternal = validateNotesInternal(input.notesInternal);
  }

  if (Object.keys(data).length === 0) {
    return { outcome: "no_op", prospectId: existing.id };
  }

  await db.platformProspect.update({
    where: { id: existing.id },
    data,
  });

  const audit = await writePlatformAuditEvent(
    {
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: "PLATFORM_PROSPECT_UPDATED",
      entityType: "PlatformProspect",
      entityId: existing.id,
      summary: `Prospect profile updated`,
      metadata: {
        prospectId: existing.id,
        updatedFields: Object.keys(data),
      },
    },
    db,
  );

  return {
    outcome: "changed",
    prospectId: existing.id,
    auditEventId: audit.id,
  };
}

export async function changePlatformProspectStatus(input: {
  prospectId: string;
  status: string;
  operatorId: string;
  prisma?: PrismaClient;
}): Promise<ProspectMutationResult> {
  const db = input.prisma ?? defaultPrisma;
  const toStatus = validateProspectStatus(input.status);
  const existing = await db.platformProspect.findUnique({
    where: { id: input.prospectId },
    select: { id: true, status: true },
  });
  if (!existing) {
    throw new PlatformProspectActionError("Prospect not found", "NOT_FOUND", 404);
  }
  if (existing.status === toStatus) {
    return {
      outcome: "no_op",
      prospectId: existing.id,
      fromStatus: existing.status,
      toStatus,
    };
  }

  await db.platformProspect.update({
    where: { id: existing.id },
    data: { status: toStatus },
  });

  const activity = await createStatusChangeActivity(db, {
    prospectId: existing.id,
    operatorId: input.operatorId,
    fromStatus: existing.status,
    toStatus,
  });

  const audit = await writePlatformAuditEvent(
    {
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: "PLATFORM_PROSPECT_STATUS_CHANGED",
      entityType: "PlatformProspect",
      entityId: existing.id,
      summary: `Prospect status ${existing.status} → ${toStatus}`,
      metadata: {
        prospectId: existing.id,
        fromStatus: existing.status,
        toStatus,
      },
    },
    db,
  );

  return {
    outcome: "changed",
    prospectId: existing.id,
    fromStatus: existing.status,
    toStatus,
    activityId: activity.id,
    auditEventId: audit.id,
  };
}

async function applyDemoAction(input: {
  prospectId: string;
  operatorId: string;
  action: ProspectDemoActionValue;
  scheduledAt?: string | null;
  note?: string | null;
  prisma?: PrismaClient;
}): Promise<ProspectMutationResult> {
  const db = input.prisma ?? defaultPrisma;
  const existing = await db.platformProspect.findUnique({
    where: { id: input.prospectId },
    select: { id: true, status: true },
  });
  if (!existing) {
    throw new PlatformProspectActionError("Prospect not found", "NOT_FOUND", 404);
  }

  const note = input.note
    ? optionalTrimmed(input.note, PROSPECT_NOTE_BODY_MAX, "Demo note")
    : null;

  let activityType:
    | "DEMO_SCHEDULED"
    | "DEMO_COMPLETED"
    | "DEMO_NO_SHOW"
    | "DEMO_CANCELLED";
  let auditAction: string;
  let scheduledAt: Date | null = null;
  let completedAt: Date | null = null;
  let nextStatus: ProspectStatus | null = null;

  switch (input.action) {
    case "schedule": {
      if (!input.scheduledAt) {
        throw new PlatformProspectActionError(
          "scheduledAt is required to schedule a demo",
          "INVALID_SCHEDULED_AT",
          400,
        );
      }
      scheduledAt = validateScheduledAt(input.scheduledAt);
      activityType = "DEMO_SCHEDULED";
      auditAction = "PLATFORM_PROSPECT_DEMO_SCHEDULED";
      nextStatus = "DEMO_SCHEDULED";
      break;
    }
    case "complete": {
      activityType = "DEMO_COMPLETED";
      auditAction = "PLATFORM_PROSPECT_DEMO_COMPLETED";
      completedAt = new Date();
      nextStatus = "DEMO_COMPLETED";
      break;
    }
    case "no_show": {
      activityType = "DEMO_NO_SHOW";
      auditAction = "PLATFORM_PROSPECT_DEMO_NO_SHOW";
      break;
    }
    case "cancel": {
      activityType = "DEMO_CANCELLED";
      auditAction = "PLATFORM_PROSPECT_DEMO_CANCELLED";
      break;
    }
    default: {
      const _exhaustive: never = input.action;
      throw new PlatformProspectActionError(
        `Unsupported demo action: ${_exhaustive}`,
        "INVALID_DEMO_ACTION",
        400,
      );
    }
  }

  let fromStatus = existing.status;
  let toStatus = existing.status;
  if (nextStatus && existing.status !== nextStatus) {
    await db.platformProspect.update({
      where: { id: existing.id },
      data: { status: nextStatus },
    });
    toStatus = nextStatus;
    await createStatusChangeActivity(db, {
      prospectId: existing.id,
      operatorId: input.operatorId,
      fromStatus,
      toStatus,
    });
  }

  const activity = await db.platformProspectActivity.create({
    data: {
      prospectId: existing.id,
      type: activityType,
      operatorId: input.operatorId,
      scheduledAt,
      completedAt,
      body: note,
    },
    select: { id: true },
  });

  const audit = await writePlatformAuditEvent(
    {
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: auditAction,
      entityType: "PlatformProspect",
      entityId: existing.id,
      summary: `Prospect demo ${input.action}`,
      metadata: {
        prospectId: existing.id,
        demoAction: input.action,
        activityId: activity.id,
        scheduledAt: scheduledAt?.toISOString() ?? null,
        fromStatus,
        toStatus,
        hasNote: Boolean(note),
      },
    },
    db,
  );

  return {
    outcome: "changed",
    prospectId: existing.id,
    activityId: activity.id,
    auditEventId: audit.id,
    fromStatus,
    toStatus,
  };
}

export async function schedulePlatformProspectDemo(input: {
  prospectId: string;
  operatorId: string;
  scheduledAt: string;
  note?: string | null;
  prisma?: PrismaClient;
}) {
  return applyDemoAction({
    ...input,
    action: "schedule",
  });
}

export async function completePlatformProspectDemo(input: {
  prospectId: string;
  operatorId: string;
  note?: string | null;
  prisma?: PrismaClient;
}) {
  return applyDemoAction({ ...input, action: "complete" });
}

export async function markPlatformProspectDemoNoShow(input: {
  prospectId: string;
  operatorId: string;
  note?: string | null;
  prisma?: PrismaClient;
}) {
  return applyDemoAction({ ...input, action: "no_show" });
}

export async function cancelPlatformProspectDemo(input: {
  prospectId: string;
  operatorId: string;
  note?: string | null;
  prisma?: PrismaClient;
}) {
  return applyDemoAction({ ...input, action: "cancel" });
}

export async function applyPlatformProspectDemoAction(input: {
  prospectId: string;
  operatorId: string;
  action: string;
  scheduledAt?: string | null;
  note?: string | null;
  prisma?: PrismaClient;
}) {
  return applyDemoAction({
    ...input,
    action: validateDemoAction(input.action),
  });
}

export async function addPlatformProspectInternalNote(input: {
  prospectId: string;
  operatorId: string;
  body: string;
  prisma?: PrismaClient;
}): Promise<ProspectMutationResult> {
  const db = input.prisma ?? defaultPrisma;
  const body = validateNoteBody(input.body);
  const existing = await db.platformProspect.findUnique({
    where: { id: input.prospectId },
    select: { id: true },
  });
  if (!existing) {
    throw new PlatformProspectActionError("Prospect not found", "NOT_FOUND", 404);
  }

  const activity = await db.platformProspectActivity.create({
    data: {
      prospectId: existing.id,
      type: "NOTE",
      operatorId: input.operatorId,
      body,
    },
    select: { id: true },
  });

  const audit = await writePlatformAuditEvent(
    {
      actorOperatorId: input.operatorId,
      actorType: "OPERATOR",
      action: "PLATFORM_PROSPECT_NOTE_ADDED",
      entityType: "PlatformProspect",
      entityId: existing.id,
      summary: "Internal prospect note added",
      metadata: {
        prospectId: existing.id,
        activityId: activity.id,
        noteLength: body.length,
      },
    },
    db,
  );

  return {
    outcome: "changed",
    prospectId: existing.id,
    activityId: activity.id,
    auditEventId: audit.id,
  };
}
