/**
 * Stage 6.6B — public HouzzatPRO website demo intake.
 * Sequential Prisma writes only — no $transaction().
 * Never touches tenant CRM / Workspace / Offer / Subscription / Stripe.
 */

import type { PrismaClient, ProspectStatus } from "@prisma/client";
import { writePlatformAuditEvent } from "@/lib/platform/audit";
import {
  BOOK_DEMO_ACTIVITY_SUMMARY,
  BOOK_DEMO_HONEYPOT_FIELD,
  BOOK_DEMO_MESSAGE_MAX,
  BOOK_DEMO_PHONE_MIN,
} from "@/lib/platform/public/book-demo-copy";
import {
  PROSPECT_BROKERAGE_NAME_MAX,
  PROSPECT_CONTACT_NAME_MAX,
  PROSPECT_CONTACT_NAME_MIN,
  PROSPECT_PHONE_MAX,
  PROSPECT_REGION_MAX,
  PROSPECT_TEAM_SIZE_MAX,
  PROSPECT_TEAM_SIZE_MIN,
  PROSPECT_WEBSITE_MAX,
} from "@/lib/platform/prospects/constants";
import { normalizeProspectEmail } from "@/lib/platform/prospects/normalize-email";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import { isHouzzatProPlatformRoot } from "@/lib/tenancy/platform-hostname";

export class BookDemoPublicError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, code: string, status = 400) {
    super(message);
    this.name = "BookDemoPublicError";
    this.status = status;
    this.code = code;
  }
}

export type BookDemoPublicInput = {
  fullName: string;
  email: string;
  phone: string;
  brokerageName: string;
  teamSize: number;
  website?: string | null;
  region?: string | null;
  message?: string | null;
  /** Honeypot — must be empty. */
  faxNumber?: string | null;
  prisma?: PrismaClient;
};

/** Internal outcome — never returned to the public client. */
export type BookDemoInternalResult = {
  prospectId: string;
  activityId: string;
  auditEventId: string;
  outcome: "created" | "updated" | "reopened" | "honeypot";
  /** Validated form fields for post-persist notification emails (null on honeypot). */
  emailPayload: {
    contactName: string;
    email: string;
    phone: string;
    brokerageName: string;
    teamSize: number;
    website: string | null;
    region: string | null;
    message: string | null;
  } | null;
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
    throw new BookDemoPublicError(
      `${field} is too long`,
      "INVALID_FIELD",
      400,
    );
  }
  return value;
}

function requireTrimmed(
  raw: string,
  min: number,
  max: number,
  field: string,
  code: string,
): string {
  const value = raw.trim();
  if (value.length < min) {
    throw new BookDemoPublicError(`${field} is required`, code, 400);
  }
  if (value.length > max) {
    throw new BookDemoPublicError(`${field} is too long`, code, 400);
  }
  return value;
}

export function assertBookDemoPlatformHostname(request: Request): void {
  const hostname = extractTrustedRequestHostname(request);
  if (!hostname || !isHouzzatProPlatformRoot(hostname)) {
    throw new BookDemoPublicError(
      "This form is only available on the HouzzatPRO website.",
      "PLATFORM_HOST_REQUIRED",
      403,
    );
  }
}

function validatePublicBookDemoFields(input: BookDemoPublicInput) {
  const contactName = requireTrimmed(
    input.fullName ?? "",
    PROSPECT_CONTACT_NAME_MIN,
    PROSPECT_CONTACT_NAME_MAX,
    "Full name",
    "INVALID_NAME",
  );
  const emailRaw = normalizeProspectEmail(input.email ?? "");
  if (!emailRaw || emailRaw.length > 254 || !EMAIL_SHAPE.test(emailRaw)) {
    throw new BookDemoPublicError(
      "Please enter a valid email address",
      "INVALID_EMAIL",
      400,
    );
  }
  const phone = requireTrimmed(
    input.phone ?? "",
    BOOK_DEMO_PHONE_MIN,
    PROSPECT_PHONE_MAX,
    "Phone",
    "INVALID_PHONE",
  );
  const brokerageName = requireTrimmed(
    input.brokerageName ?? "",
    1,
    PROSPECT_BROKERAGE_NAME_MAX,
    "Brokerage / company name",
    "INVALID_BROKERAGE",
  );
  if (
    !Number.isInteger(input.teamSize) ||
    input.teamSize < PROSPECT_TEAM_SIZE_MIN ||
    input.teamSize > PROSPECT_TEAM_SIZE_MAX
  ) {
    throw new BookDemoPublicError(
      "Please enter a valid team size",
      "INVALID_TEAM_SIZE",
      400,
    );
  }

  const website: string | null = optionalTrimmed(
    input.website,
    PROSPECT_WEBSITE_MAX,
    "Website",
  );
  if (website) {
    try {
      const url = new URL(website);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("bad protocol");
      }
    } catch {
      throw new BookDemoPublicError(
        "Website must be a valid http(s) URL",
        "INVALID_WEBSITE",
        400,
      );
    }
  }

  const region = optionalTrimmed(input.region, PROSPECT_REGION_MAX, "Region");
  const message = optionalTrimmed(
    input.message,
    BOOK_DEMO_MESSAGE_MAX,
    "Message",
  );

  return {
    contactName,
    email: emailRaw,
    phone,
    brokerageName,
    estimatedTeamSize: input.teamSize,
    website,
    region,
    message,
  };
}

function activityBody(message: string | null): string {
  if (!message) return BOOK_DEMO_ACTIVITY_SUMMARY;
  return `${BOOK_DEMO_ACTIVITY_SUMMARY}\n\n${message}`;
}

async function writeWebsiteDemoActivity(
  db: PrismaClient,
  prospectId: string,
  message: string | null,
) {
  return db.platformProspectActivity.create({
    data: {
      prospectId,
      type: "NOTE",
      body: activityBody(message),
      operatorId: null,
    },
    select: { id: true },
  });
}

async function writeWebsiteDemoAudit(
  db: PrismaClient,
  prospectId: string,
  outcome: "created" | "updated" | "reopened",
  hasMessage: boolean,
) {
  return writePlatformAuditEvent(
    {
      actorOperatorId: null,
      actorType: "SYSTEM",
      action: "PLATFORM_PROSPECT_WEBSITE_DEMO_RECEIVED",
      entityType: "PlatformProspect",
      entityId: prospectId,
      summary: "Website demo request received",
      metadata: {
        prospectId,
        source: "WEBSITE_DEMO",
        outcome,
        hasMessage,
      },
    },
    db,
  );
}

/**
 * Receive a public Book a Demo submission.
 * Never returns whether the email was new/existing to the caller contract —
 * callers should always present the same public success UX.
 */
export async function receiveWebsiteDemoRequest(
  input: BookDemoPublicInput,
): Promise<BookDemoInternalResult> {
  const honeypot = (input.faxNumber ?? "").trim();
  if (honeypot) {
    return {
      prospectId: "honeypot",
      activityId: "honeypot",
      auditEventId: "honeypot",
      outcome: "honeypot",
      emailPayload: null,
    };
  }

  // Reject injected privileged fields if somehow present on a wider object.
  const unsafe = input as BookDemoPublicInput & Record<string, unknown>;
  if (
    unsafe.status != null ||
    unsafe.ownerOperatorId != null ||
    unsafe.notesInternal != null ||
    unsafe.source != null
  ) {
    throw new BookDemoPublicError(
      "Invalid request",
      "INVALID_FIELD",
      400,
    );
  }

  const fields = validatePublicBookDemoFields(input);
  const db = input.prisma ?? defaultPrisma;
  const emailPayload = {
    contactName: fields.contactName,
    email: fields.email,
    phone: fields.phone,
    brokerageName: fields.brokerageName,
    teamSize: fields.estimatedTeamSize,
    website: fields.website,
    region: fields.region,
    message: fields.message,
  };

  const existing = await db.platformProspect.findUnique({
    where: { email: fields.email },
    select: { id: true, status: true },
  });

  const profileData = {
    contactName: fields.contactName,
    phone: fields.phone,
    brokerageName: fields.brokerageName,
    estimatedTeamSize: fields.estimatedTeamSize,
    website: fields.website,
    region: fields.region,
    source: "WEBSITE_DEMO" as const,
  };

  if (!existing) {
    const created = await db.platformProspect.create({
      data: {
        ...profileData,
        email: fields.email,
        // Public form does not collect a team/business name — do not invent one.
        businessName: null,
        status: "NEW",
        ownerOperatorId: null,
      },
      select: { id: true },
    });
    const activity = await writeWebsiteDemoActivity(
      db,
      created.id,
      fields.message,
    );
    const audit = await writeWebsiteDemoAudit(
      db,
      created.id,
      "created",
      Boolean(fields.message),
    );
    return {
      prospectId: created.id,
      activityId: activity.id,
      auditEventId: audit.id,
      outcome: "created",
      emailPayload,
    };
  }

  if (existing.status === "LOST") {
    const fromStatus: ProspectStatus = "LOST";
    await db.platformProspect.update({
      where: { id: existing.id },
      data: {
        ...profileData,
        status: "NEW",
      },
    });
    await db.platformProspectActivity.create({
      data: {
        prospectId: existing.id,
        type: "STATUS_CHANGE",
        body: `${fromStatus} → NEW`,
        operatorId: null,
      },
    });
    const activity = await writeWebsiteDemoActivity(
      db,
      existing.id,
      fields.message,
    );
    const audit = await writeWebsiteDemoAudit(
      db,
      existing.id,
      "reopened",
      Boolean(fields.message),
    );
    return {
      prospectId: existing.id,
      activityId: activity.id,
      auditEventId: audit.id,
      outcome: "reopened",
      emailPayload,
    };
  }

  await db.platformProspect.update({
    where: { id: existing.id },
    data: profileData,
  });
  const activity = await writeWebsiteDemoActivity(
    db,
    existing.id,
    fields.message,
  );
  const audit = await writeWebsiteDemoAudit(
    db,
    existing.id,
    "updated",
    Boolean(fields.message),
  );
  return {
    prospectId: existing.id,
    activityId: activity.id,
    auditEventId: audit.id,
    outcome: "updated",
    emailPayload,
  };
}

export { BOOK_DEMO_HONEYPOT_FIELD };
