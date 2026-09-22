/**
 * Phase 1 Lead identity: resolve person + workspace BEFORE routing.
 *
 * Existing Lead → reuse, sticky assignedAgentId, OR flags, keep source,
 * append activity, reuse Conversation. Never run Buyer/Seller routing.
 *
 * New Lead → caller supplies desk assignment (PERCENTAGE or LISTING_AGENT).
 *
 * Durable uniqueness: partial unique (workspaceId, customerId)
 * WHERE customerId IS NOT NULL. Concurrent creates that lose the unique
 * race resolve the winner — never reroute, never overwrite Agent, never 500.
 * In-process lock remains best-effort for same-runtime overlap.
 */
import type { LeadIntent, LeadSource, Prisma, PrismaClient } from "@prisma/client";
import {
  finalizeWritableLeadClassification,
  mergeIncomingLeadClassification,
} from "@/lib/agent/lead-classification";
import {
  diffLeadClassificationChanges,
  type MaterialLeadInfoChange,
} from "@/lib/agent/lead-info-change";
import {
  AmbiguousLeadIdentityError,
  identityLockKey,
  normalizeLeadEmail,
  normalizeLeadPhoneE164,
} from "@/lib/agent/lead-identity";
import { selectPrimaryLeadsByCustomer } from "@/lib/agent/select-primary-leads-by-customer";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { parsePhoneColumnsForWrite } from "@/lib/sms/e164";
import {
  getOrCreateLeadConversation,
  type LeadConversationDb,
} from "@/lib/conversations/lead-conversation";

const leadIdentitySelect = {
  id: true,
  workspaceId: true,
  customerId: true,
  assignedAgentId: true,
  source: true,
  intent: true,
  isBuyer: true,
  isSeller: true,
  score: true,
  updatedAt: true,
  contactConsentAt: true,
} satisfies Prisma.LeadSelect;

export type WorkspaceLeadIdentityRow = Prisma.LeadGetPayload<{
  select: typeof leadIdentitySelect;
}>;

export type ResolveCreateDesk = {
  assigneeId: string | null;
  organizationId: string | null;
};

export type ResolveWorkspaceLeadActivity = {
  type: string;
  body?: string | null;
  meta?: Prisma.InputJsonValue;
  userId?: string | null;
};

export type ResolveOrCreateWorkspaceLeadInput = {
  workspaceId: string;
  organizationId?: string | null;
  customerId?: string | null;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  isBuyer?: boolean;
  isSeller?: boolean;
  source: LeadSource;
  notes?: string | null;
  score?: number;
  listingMls?: string | null;
  contactConsentAt?: Date | null;
  actorId?: string | null;
  utm?: {
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    utmContent?: string | null;
    adCampaignId?: string | null;
  };
  activity?: ResolveWorkspaceLeadActivity | null;
  /**
   * Called only when inserting a new Lead. Must not run for an existing Lead.
   */
  resolveCreateDesk: () => Promise<ResolveCreateDesk>;
  /**
   * When false, do not create a User from guest email (session-only).
   * Default true when email is present.
   */
  upsertCustomer?: boolean;
  /**
   * Existing Lead reuse still skips routing. Set false to also skip a new
   * activity row on that reuse (repeat sign-in).
   */
  activityOnReuse?: boolean;
  db?: PrismaClient;
};

export type ResolveOrCreateWorkspaceLeadResult = {
  lead: WorkspaceLeadIdentityRow;
  created: boolean;
  assignedAgentId: string | null;
  organizationId: string | null;
  customerId: string | null;
  classificationChanges: MaterialLeadInfoChange[];
};

const inFlight = new Map<string, Promise<ResolveOrCreateWorkspaceLeadResult>>();

type MatchedIdentity = {
  customerId: string | null;
  leads: WorkspaceLeadIdentityRow[];
};

async function listWorkspaceLeadsForCustomer(
  db: PrismaClient,
  workspaceId: string,
  customerId: string,
): Promise<WorkspaceLeadIdentityRow[]> {
  return db.lead.findMany({
    where: { workspaceId, customerId },
    select: leadIdentitySelect,
  });
}

async function findUserByEmail(
  db: PrismaClient,
  email: string,
): Promise<{ id: string; phoneE164: string | null } | null> {
  return db.user.findUnique({
    where: { email },
    select: { id: true, phoneE164: true },
  });
}

async function findWorkspaceLeadsByPhone(
  db: PrismaClient,
  workspaceId: string,
  phoneE164: string,
): Promise<Array<{ customerId: string | null }>> {
  return db.lead.findMany({
    where: {
      workspaceId,
      customer: { is: { phoneE164 } },
    },
    select: { customerId: true },
  });
}

async function uniqueUsersWithPhone(
  db: PrismaClient,
  phoneE164: string,
): Promise<string[]> {
  const rows = await db.user.findMany({
    where: { phoneE164 },
    select: { id: true },
  });
  return [...new Set(rows.map((row) => row.id))];
}

/**
 * Match one person inside one workspace. Throws on ambiguity.
 */
export async function matchWorkspaceLeadIdentity(
  db: PrismaClient,
  input: {
    workspaceId: string;
    customerId?: string | null;
    email?: string | null;
    phone?: string | null;
  },
): Promise<MatchedIdentity> {
  const workspaceId = input.workspaceId.trim();
  const customerId = input.customerId?.trim() || null;
  const email = normalizeLeadEmail(input.email);
  const phoneE164 = normalizeLeadPhoneE164(input.phone);

  if (!workspaceId) {
    return { customerId: null, leads: [] };
  }

  let emailUserId: string | null = null;
  if (email) {
    const user = await findUserByEmail(db, email);
    emailUserId = user?.id ?? null;
  }

  let phoneUserIds: string[] = [];
  if (phoneE164) {
    const leadHits = await findWorkspaceLeadsByPhone(db, workspaceId, phoneE164);
    const fromLeads = [
      ...new Set(
        leadHits
          .map((row) => row.customerId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (fromLeads.length > 1) {
      throw new AmbiguousLeadIdentityError();
    }
    if (fromLeads.length === 1) {
      phoneUserIds = fromLeads;
    } else {
      phoneUserIds = await uniqueUsersWithPhone(db, phoneE164);
      if (phoneUserIds.length > 1) {
        throw new AmbiguousLeadIdentityError();
      }
    }
  }

  if (emailUserId && phoneUserIds.length === 1 && phoneUserIds[0] !== emailUserId) {
    throw new AmbiguousLeadIdentityError();
  }

  if (customerId && emailUserId && customerId !== emailUserId) {
    throw new AmbiguousLeadIdentityError();
  }

  if (customerId && phoneUserIds.length === 1 && phoneUserIds[0] !== customerId) {
    throw new AmbiguousLeadIdentityError();
  }

  const resolvedCustomerId = customerId ?? emailUserId ?? phoneUserIds[0] ?? null;
  if (!resolvedCustomerId) {
    return { customerId: null, leads: [] };
  }

  const leads = await listWorkspaceLeadsForCustomer(
    db,
    workspaceId,
    resolvedCustomerId,
  );
  return { customerId: resolvedCustomerId, leads };
}

async function findOrCreateCustomerUser(
  db: PrismaClient,
  input: {
    email: string;
    name?: string | null;
    phone?: string | null;
    isBuyer: boolean;
    isSeller: boolean;
  },
): Promise<string> {
  const existing = await db.user.findUnique({
    where: { email: input.email },
    select: { id: true, phone: true, name: true },
  });
  if (existing) return existing.id;

  const parsedPhone = input.phone
    ? parsePhoneColumnsForWrite(input.phone)
    : { ok: true as const, columns: {} };

  try {
    if (!parsedPhone.ok) {
      const created = await db.user.create({
        data: {
          email: input.email,
          name: input.name?.trim() || null,
          role: "BUYER",
          isBuyer: input.isBuyer,
          isSeller: input.isSeller,
          activeMode: input.isSeller ? "SELLER" : "BUYER",
        },
        select: { id: true },
      });
      return created.id;
    }

    const created = await db.user.create({
      data: {
        email: input.email,
        name: input.name?.trim() || null,
        role: "BUYER",
        isBuyer: input.isBuyer,
        isSeller: input.isSeller,
        activeMode: input.isSeller ? "SELLER" : "BUYER",
        ...parsedPhone.columns,
      },
      select: { id: true },
    });
    return created.id;
  } catch (error) {
    const raced = await db.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (raced) return raced.id;
    throw error;
  }
}

async function appendActivity(
  db: PrismaClient,
  leadId: string,
  activity: ResolveWorkspaceLeadActivity | null | undefined,
  fallbackUserId: string | null,
): Promise<void> {
  if (!activity) return;
  await db.leadActivity.create({
    data: {
      leadId,
      type: activity.type,
      body: activity.body ?? null,
      meta: activity.meta,
      userId: activity.userId ?? fallbackUserId ?? undefined,
    },
  });
}

async function ensureConversation(
  db: PrismaClient,
  workspaceId: string,
  leadId: string,
): Promise<void> {
  await getOrCreateLeadConversation(db as unknown as LeadConversationDb, {
    workspaceId,
    leadId,
  });
}

async function attachToExistingLead(
  db: PrismaClient,
  input: ResolveOrCreateWorkspaceLeadInput,
  existing: WorkspaceLeadIdentityRow,
  customerId: string | null,
): Promise<ResolveOrCreateWorkspaceLeadResult> {
  const incoming = finalizeWritableLeadClassification({
    isBuyer: input.isBuyer === true,
    isSeller: input.isSeller === true,
  });
  const merged = mergeIncomingLeadClassification(existing, {
    isBuyer: incoming.isBuyer,
    isSeller: incoming.isSeller,
  });

  const nextCustomerId = existing.customerId ?? customerId;
  const nextConsent =
    existing.contactConsentAt ?? input.contactConsentAt ?? undefined;

  const updated = await db.lead.update({
    where: { id: existing.id },
    data: {
      isBuyer: merged.isBuyer,
      isSeller: merged.isSeller,
      intent: merged.intent,
      ...(nextCustomerId && nextCustomerId !== existing.customerId
        ? { customerId: nextCustomerId }
        : {}),
      ...(nextConsent && !existing.contactConsentAt
        ? { contactConsentAt: nextConsent }
        : {}),
    },
    select: leadIdentitySelect,
  });

  if (input.activityOnReuse !== false) {
    await appendActivity(
      db,
      updated.id,
      input.activity,
      input.actorId ?? nextCustomerId,
    );
  }
  if (updated.workspaceId) {
    await ensureConversation(db, updated.workspaceId, updated.id);
  }

  return {
    lead: updated,
    created: false,
    assignedAgentId: updated.assignedAgentId,
    organizationId: input.organizationId ?? null,
    customerId: updated.customerId,
    classificationChanges: diffLeadClassificationChanges(existing, updated),
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

async function recoverExistingAfterCreateConflict(
  db: PrismaClient,
  input: ResolveOrCreateWorkspaceLeadInput,
  customerId: string | null,
): Promise<ResolveOrCreateWorkspaceLeadResult | null> {
  if (!customerId) return null;
  const again = await listWorkspaceLeadsForCustomer(
    db,
    input.workspaceId,
    customerId,
  );
  const raced = selectPrimaryLeadsByCustomer(again)[0];
  if (raced && raced.workspaceId === input.workspaceId) {
    return attachToExistingLead(db, input, raced, customerId);
  }
  return null;
}

async function insertNewLead(
  db: PrismaClient,
  input: ResolveOrCreateWorkspaceLeadInput,
  customerId: string | null,
): Promise<ResolveOrCreateWorkspaceLeadResult> {
  const classification = finalizeWritableLeadClassification({
    isBuyer: input.isBuyer === true,
    isSeller: input.isSeller === true,
  });

  const existing = await recoverExistingAfterCreateConflict(db, input, customerId);
  if (existing) return existing;

  const desk = await input.resolveCreateDesk();
  const organizationId = desk.organizationId ?? input.organizationId ?? null;

  try {
    const created = await db.lead.create({
      data: {
        source: input.source,
        status: "NEW_LEAD",
        intent: classification.intent,
        isBuyer: classification.isBuyer,
        isSeller: classification.isSeller,
        score: input.score ?? 15,
        notes: input.notes ?? null,
        listingMls: input.listingMls ?? null,
        customerId,
        assignedAgentId: desk.assigneeId,
        organizationId: organizationId ?? undefined,
        workspaceId: input.workspaceId,
        contactConsentAt: input.contactConsentAt ?? undefined,
        statusChangedAt: new Date(),
        utmSource: input.utm?.utmSource ?? undefined,
        utmMedium: input.utm?.utmMedium ?? undefined,
        utmCampaign: input.utm?.utmCampaign ?? undefined,
        utmContent: input.utm?.utmContent ?? undefined,
        adCampaignId: input.utm?.adCampaignId ?? undefined,
      },
      select: leadIdentitySelect,
    });

    await appendActivity(
      db,
      created.id,
      input.activity,
      input.actorId ?? customerId,
    );
    if (created.workspaceId) {
      await ensureConversation(db, created.workspaceId, created.id);
    }

    return {
      lead: created,
      created: true,
      assignedAgentId: created.assignedAgentId,
      organizationId,
      customerId: created.customerId,
      classificationChanges: [],
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const recovered = await recoverExistingAfterCreateConflict(
        db,
        input,
        customerId,
      );
      if (recovered) return recovered;
    }
    throw error;
  }
}

async function resolveOrCreateUnlocked(
  input: ResolveOrCreateWorkspaceLeadInput,
): Promise<ResolveOrCreateWorkspaceLeadResult> {
  const db = input.db ?? defaultPrisma;
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) {
    throw new Error("workspaceId required for Lead identity resolution");
  }

  const classification = finalizeWritableLeadClassification({
    isBuyer: input.isBuyer === true,
    isSeller: input.isSeller === true,
  });
  const email = normalizeLeadEmail(input.email);
  const upsertCustomer = input.upsertCustomer !== false && Boolean(email);

  let customerId = input.customerId?.trim() || null;
  if (!customerId && upsertCustomer && email) {
    customerId = await findOrCreateCustomerUser(db, {
      email,
      name: input.name,
      phone: input.phone,
      isBuyer: classification.isBuyer,
      isSeller: classification.isSeller,
    });
  }

  const matched = await matchWorkspaceLeadIdentity(db, {
    workspaceId,
    customerId,
    email,
    phone: input.phone,
  });
  customerId = matched.customerId ?? customerId;

  const primary = selectPrimaryLeadsByCustomer(matched.leads)[0];
  if (primary && primary.workspaceId === workspaceId) {
    return attachToExistingLead(db, input, primary, customerId);
  }

  const again = customerId
    ? await listWorkspaceLeadsForCustomer(db, workspaceId, customerId)
    : [];
  const raced = selectPrimaryLeadsByCustomer(again)[0];
  if (raced && raced.workspaceId === workspaceId) {
    return attachToExistingLead(db, input, raced, customerId);
  }

  return insertNewLead(db, input, customerId);
}

export async function resolveOrCreateWorkspaceLead(
  input: ResolveOrCreateWorkspaceLeadInput,
): Promise<ResolveOrCreateWorkspaceLeadResult> {
  const lockKey = identityLockKey({
    workspaceId: input.workspaceId,
    customerId: input.customerId,
    email: input.email,
    phone: input.phone,
  });
  if (!lockKey) {
    return resolveOrCreateUnlocked(input);
  }

  const pending = inFlight.get(lockKey);
  if (pending) {
    await pending;
    return resolveOrCreateUnlocked(input);
  }

  const run = resolveOrCreateUnlocked(input).finally(() => {
    inFlight.delete(lockKey);
  });
  inFlight.set(lockKey, run);
  return run;
}

/** Test-only: drop in-process intake locks. */
export function resetLeadIdentityLocksForTests(): void {
  inFlight.clear();
}

/** Test-only: simulate a separate Worker/process (no in-memory lock). */
export async function resolveOrCreateWorkspaceLeadWithoutProcessLock(
  input: ResolveOrCreateWorkspaceLeadInput,
): Promise<ResolveOrCreateWorkspaceLeadResult> {
  return resolveOrCreateUnlocked(input);
}

export { AmbiguousLeadIdentityError };
