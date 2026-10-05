/**
 * Canonical preference/suppression audit primitive.
 * Distinct from LeadActivity. Existing preference UIs are not wired in Phase 1.
 */

export type CommunicationPreferenceAuditRecord = {
  workspaceId: string | null;
  userId: string | null;
  leadId: string | null;
  emailNormalized: string | null;
  kind: string;
  category: string | null;
  channel: string | null;
  previousState: Record<string, unknown> | null;
  resultingState: Record<string, unknown> | null;
  source: string;
  providerEventId: string | null;
  providerId: string | null;
  ip: string | null;
  userAgent: string | null;
  meta: Record<string, unknown> | null;
};

export type CommunicationPreferenceAuditStore = {
  findByProviderEventId(
    providerEventId: string,
  ): Promise<CommunicationPreferenceAuditRecord | null>;
  create(
    record: CommunicationPreferenceAuditRecord,
  ): Promise<CommunicationPreferenceAuditRecord>;
};

export function buildPreferenceAuditRecord(input: {
  workspaceId?: string | null;
  userId?: string | null;
  leadId?: string | null;
  emailNormalized?: string | null;
  kind: string;
  category?: string | null;
  channel?: string | null;
  previousState?: Record<string, unknown> | null;
  resultingState?: Record<string, unknown> | null;
  source: string;
  providerEventId?: string | null;
  providerId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown> | null;
}): CommunicationPreferenceAuditRecord {
  return {
    workspaceId: input.workspaceId ?? null,
    userId: input.userId ?? null,
    leadId: input.leadId ?? null,
    emailNormalized: input.emailNormalized ?? null,
    kind: input.kind,
    category: input.category ?? null,
    channel: input.channel ?? null,
    previousState: input.previousState ?? null,
    resultingState: input.resultingState ?? null,
    source: input.source,
    providerEventId: input.providerEventId ?? null,
    providerId: input.providerId ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    meta: input.meta ?? null,
  };
}

export async function recordCommunicationPreferenceEvent(
  store: CommunicationPreferenceAuditStore,
  input: CommunicationPreferenceAuditRecord,
): Promise<{ created: boolean; record: CommunicationPreferenceAuditRecord }> {
  if (input.providerEventId) {
    const existing = await store.findByProviderEventId(input.providerEventId);
    if (existing) return { created: false, record: existing };
  }
  try {
    const record = await store.create(input);
    return { created: true, record };
  } catch (error) {
    if (input.providerEventId && isUniqueViolation(error)) {
      const existing = await store.findByProviderEventId(input.providerEventId);
      if (existing) return { created: false, record: existing };
    }
    throw error;
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002",
  );
}

export function memoryPreferenceAuditStore(): CommunicationPreferenceAuditStore & {
  rows: CommunicationPreferenceAuditRecord[];
} {
  const rows: CommunicationPreferenceAuditRecord[] = [];
  return {
    rows,
    async findByProviderEventId(providerEventId) {
      return rows.find((row) => row.providerEventId === providerEventId) ?? null;
    },
    async create(record) {
      if (
        record.providerEventId &&
        rows.some((row) => row.providerEventId === record.providerEventId)
      ) {
        const error = new Error("unique") as Error & { code: string };
        error.code = "P2002";
        throw error;
      }
      rows.push(record);
      return record;
    },
  };
}
