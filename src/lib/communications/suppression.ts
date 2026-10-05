import { normalizeIdentityEmail } from "@/lib/auth/workspace-identity";
import { isUniqueViolation } from "@/lib/communications/preference-audit";

export const EMAIL_SUPPRESSION_REASONS = [
  "HARD_BOUNCE",
  "COMPLAINT",
  "GLOBAL_UNSUBSCRIBE",
  "ADMIN",
] as const;

export type EmailSuppressionReason = (typeof EMAIL_SUPPRESSION_REASONS)[number];

export const EMAIL_SUPPRESSION_SCOPES = ["MAILBOX", "CUSTOMER"] as const;

export type EmailSuppressionScope = (typeof EMAIL_SUPPRESSION_SCOPES)[number];

export type EmailSuppressionRecord = {
  workspaceId: string;
  userId: string | null;
  emailNormalized: string;
  scope: EmailSuppressionScope;
  identityKey: string;
  reason: EmailSuppressionReason;
  source: string;
  providerId: string | null;
  leadEmailLogId: string | null;
  meta: Record<string, unknown> | null;
};

export type EmailSuppressionStore = {
  findByIdentity(input: {
    workspaceId: string;
    scope: EmailSuppressionScope;
    identityKey: string;
  }): Promise<EmailSuppressionRecord | null>;
  upsert(record: EmailSuppressionRecord): Promise<{ created: boolean }>;
};

export type SuppressionLookupStatus =
  | "suppressed"
  | "not_suppressed"
  | "unavailable";

export type SuppressionLookupResult = {
  status: SuppressionLookupStatus;
  record: EmailSuppressionRecord | null;
  matchedScope: EmailSuppressionScope | null;
  error?: unknown;
};

/**
 * Provider/mailbox reasons share a rank so COMPLAINT cannot replace HARD_BOUNCE
 * (or vice versa) as a downgrade. Preference reasons rank below provider.
 * Weaker incoming reasons never overwrite a stronger current-state row.
 */
export function suppressionReasonRank(reason: EmailSuppressionReason): number {
  switch (reason) {
    case "HARD_BOUNCE":
    case "COMPLAINT":
      return 30;
    case "GLOBAL_UNSUBSCRIBE":
      return 20;
    case "ADMIN":
      return 10;
  }
}

export function scopeForSuppressionReason(
  reason: EmailSuppressionReason,
): EmailSuppressionScope {
  return reason === "GLOBAL_UNSUBSCRIBE" ? "CUSTOMER" : "MAILBOX";
}

export function normalizeSuppressionEmail(email: string): string {
  return normalizeIdentityEmail(email);
}

export function mailboxIdentityKey(emailNormalized: string): string {
  return normalizeSuppressionEmail(emailNormalized);
}

export function customerIdentityKey(userId: string): string {
  return userId;
}

export function buildEmailSuppressionRecord(
  input: Omit<EmailSuppressionRecord, "scope" | "identityKey"> & {
    scope?: EmailSuppressionScope;
    identityKey?: string;
  },
): EmailSuppressionRecord {
  const emailNormalized = normalizeSuppressionEmail(input.emailNormalized);
  const scope = input.scope ?? scopeForSuppressionReason(input.reason);
  if (scope === "CUSTOMER") {
    if (!input.userId) {
      throw new Error("CUSTOMER suppression requires userId");
    }
    return {
      ...input,
      emailNormalized,
      scope,
      identityKey: input.identityKey ?? customerIdentityKey(input.userId),
    };
  }
  return {
    ...input,
    emailNormalized,
    scope,
    identityKey: input.identityKey ?? mailboxIdentityKey(emailNormalized),
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function mergeSuppressionCurrentState(
  existing: EmailSuppressionRecord | null,
  incoming: EmailSuppressionRecord,
): { record: EmailSuppressionRecord; reasonChanged: boolean } {
  if (!existing) {
    return {
      record: {
        ...incoming,
        meta: {
          ...(incoming.meta ?? {}),
          originalReason: incoming.reason,
          reasonHistory: [incoming.reason],
        },
      },
      reasonChanged: true,
    };
  }

  const incomingRank = suppressionReasonRank(incoming.reason);
  const existingRank = suppressionReasonRank(existing.reason);
  const keepExistingReason = incomingRank <= existingRank;
  const reason = keepExistingReason ? existing.reason : incoming.reason;
  const previousHistory = asStringArray(existing.meta?.reasonHistory);
  const reasonHistory =
    previousHistory.length > 0
      ? [...previousHistory, incoming.reason]
      : [existing.reason, incoming.reason];

  return {
    record: {
      workspaceId: existing.workspaceId,
      scope: existing.scope,
      identityKey: existing.identityKey,
      emailNormalized: existing.emailNormalized,
      userId: existing.userId ?? incoming.userId,
      reason,
      source: keepExistingReason ? existing.source : incoming.source,
      providerId: incoming.providerId ?? existing.providerId,
      leadEmailLogId: incoming.leadEmailLogId ?? existing.leadEmailLogId,
      meta: {
        ...(existing.meta ?? {}),
        lastEvent: incoming.meta ?? null,
        originalReason:
          existing.meta?.originalReason ?? existing.reason,
        reasonHistory,
      },
    },
    reasonChanged: reason !== existing.reason,
  };
}

export async function findMailboxEmailSuppression(
  store: EmailSuppressionStore,
  input: { workspaceId: string; email: string },
): Promise<EmailSuppressionRecord | null> {
  return store.findByIdentity({
    workspaceId: input.workspaceId,
    scope: "MAILBOX",
    identityKey: mailboxIdentityKey(input.email),
  });
}

export async function findCustomerEmailSuppression(
  store: EmailSuppressionStore,
  input: { workspaceId: string; userId: string },
): Promise<EmailSuppressionRecord | null> {
  return store.findByIdentity({
    workspaceId: input.workspaceId,
    scope: "CUSTOMER",
    identityKey: customerIdentityKey(input.userId),
  });
}

/** Mailbox/provider current-state only. Does not return customer preference rows. */
export async function findActiveEmailSuppression(
  store: EmailSuppressionStore,
  input: { workspaceId: string; email: string },
): Promise<EmailSuppressionRecord | null> {
  return findMailboxEmailSuppression(store, input);
}

export async function lookupEmailSuppression(
  store: EmailSuppressionStore,
  input: { workspaceId: string; email: string; userId?: string | null },
): Promise<SuppressionLookupResult> {
  try {
    const mailbox = await findMailboxEmailSuppression(store, {
      workspaceId: input.workspaceId,
      email: input.email,
    });
    if (mailbox) {
      return {
        status: "suppressed",
        record: mailbox,
        matchedScope: "MAILBOX",
      };
    }
    if (input.userId) {
      const customer = await findCustomerEmailSuppression(store, {
        workspaceId: input.workspaceId,
        userId: input.userId,
      });
      if (customer) {
        return {
          status: "suppressed",
          record: customer,
          matchedScope: "CUSTOMER",
        };
      }
    }
    return { status: "not_suppressed", record: null, matchedScope: null };
  } catch (error) {
    return {
      status: "unavailable",
      record: null,
      matchedScope: null,
      error,
    };
  }
}

export async function applyEmailSuppression(
  store: EmailSuppressionStore,
  input: Omit<EmailSuppressionRecord, "scope" | "identityKey"> & {
    scope?: EmailSuppressionScope;
    identityKey?: string;
  },
): Promise<{
  created: boolean;
  record: EmailSuppressionRecord;
  reasonChanged: boolean;
}> {
  const incoming = buildEmailSuppressionRecord(input);
  const existing = await store.findByIdentity({
    workspaceId: incoming.workspaceId,
    scope: incoming.scope,
    identityKey: incoming.identityKey,
  });
  const merged = mergeSuppressionCurrentState(existing, incoming);
  try {
    const result = await store.upsert(merged.record);
    return {
      created: result.created,
      record: merged.record,
      reasonChanged: merged.reasonChanged,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await store.findByIdentity({
        workspaceId: incoming.workspaceId,
        scope: incoming.scope,
        identityKey: incoming.identityKey,
      });
      if (raced) {
        return { created: false, record: raced, reasonChanged: false };
      }
    }
    throw error;
  }
}

export function memoryEmailSuppressionStore(): EmailSuppressionStore & {
  rows: EmailSuppressionRecord[];
} {
  const rows: EmailSuppressionRecord[] = [];
  return {
    rows,
    async findByIdentity({ workspaceId, scope, identityKey }) {
      return (
        rows.find(
          (row) =>
            row.workspaceId === workspaceId &&
            row.scope === scope &&
            row.identityKey === identityKey,
        ) ?? null
      );
    },
    async upsert(record) {
      const index = rows.findIndex(
        (row) =>
          row.workspaceId === record.workspaceId &&
          row.scope === record.scope &&
          row.identityKey === record.identityKey,
      );
      if (index === -1) {
        rows.push(record);
        return { created: true };
      }
      rows[index] = record;
      return { created: false };
    },
  };
}
