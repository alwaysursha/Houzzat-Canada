import type { MlsHealthReconcile, MlsHealthRun } from "@/lib/mls-health/types";

function numberField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Classifies auth failures without keeping the provider message. */
export function classifyCredentialReason(
  message: string | null | undefined,
): MlsHealthRun["credentialReason"] {
  if (!message) return null;
  if (/\b401\b/.test(message)) return "http_401";
  if (/\b403\b/.test(message)) return "http_403";
  if (/credential/i.test(message)) return "credentials";
  return null;
}

function mediaErrorCount(stats: Record<string, unknown>): number {
  const errors = stats.errors;
  if (!Array.isArray(errors)) return 0;
  return errors.filter((item) => typeof item === "string" && /media/i.test(item)).length;
}

function reconcileFrom(stats: Record<string, unknown>): MlsHealthReconcile | null {
  const value = asRecord(stats.onMarketReconcile);
  if (!value) return null;
  return {
    discoveryComplete: value.discoveryComplete === true,
    rotationBudget: numberField(value, "rotationBudget"),
  };
}

export function toMlsHealthRun(row: {
  id: string;
  resource: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  message?: string | null;
  stats?: unknown;
}): MlsHealthRun {
  const stats = asRecord(row.stats) ?? {};
  return {
    id: row.id,
    resource: row.resource,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    pages: numberField(stats, "pages"),
    proptxRetriesExhausted: numberField(stats, "proptxRetriesExhausted"),
    proptx429: numberField(stats, "proptx429"),
    proptx5xx: numberField(stats, "proptx5xx"),
    proptxTimeouts: numberField(stats, "proptxTimeouts"),
    proptxNetworkErrors: numberField(stats, "proptxNetworkErrors"),
    typesenseFailed: numberField(stats, "typesenseFailed"),
    mediaFetches: numberField(stats, "mediaFetches"),
    mediaErrorCount: mediaErrorCount(stats),
    onMarketReconcile: reconcileFrom(stats),
    credentialReason: classifyCredentialReason(row.message),
  };
}

export function typesenseRetryCount(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(cursor) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}
