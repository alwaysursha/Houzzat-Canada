/**
 * Phase 3B — customer watch/alert toggle helpers.
 * Pure builders + race-safe apply so UI and selftests share one contract.
 */

export type AreaAlertField = "emailAlerts" | "notifyNew" | "notifySold";

export function buildPropertyEmailAlertsPatch(
  mlsNumber: string,
  emailAlerts: boolean,
) {
  return { mlsNumber, emailAlerts } as const;
}

export function buildAreaAlertFieldPatch(
  id: string,
  field: AreaAlertField,
  value: boolean,
): {
  id: string;
  emailAlerts?: boolean;
  notifyNew?: boolean;
  notifySold?: boolean;
} {
  return { id, [field]: value };
}

export function buildSavedSearchEmailAlertsPatch(
  id: string,
  emailAlerts: boolean,
) {
  return { id, emailAlerts } as const;
}

/** Advance a per-key generation counter; returns the new generation. */
export function nextMutationGeneration(
  map: Map<string, number>,
  key: string,
): number {
  const next = (map.get(key) ?? 0) + 1;
  map.set(key, next);
  return next;
}

export function isCurrentMutationGeneration(
  map: Map<string, number>,
  key: string,
  generation: number,
): boolean {
  return map.get(key) === generation;
}

/**
 * Resolve UI state after a toggle attempt.
 * - Stale response (generation mismatch) → null (caller keeps current UI).
 * - Failure → previous (rollback).
 * - Success → serverConfirmed.
 */
export function resolveToggleMutationOutcome<T>(input: {
  generation: number;
  latestGeneration: number;
  previous: T;
  serverConfirmed: T | null;
}): T | null {
  if (input.generation !== input.latestGeneration) return null;
  if (input.serverConfirmed == null) return input.previous;
  return input.serverConfirmed;
}

export function propertyEmailAlertsHint(emailAlerts: boolean): string {
  return emailAlerts ? "Email alerts are on" : "Email alerts are paused";
}

export function areaEmailAlertsHint(emailAlerts: boolean): string {
  return emailAlerts
    ? "Email alerts are on for this area"
    : "Email alerts are paused for this area";
}

export const GLOBAL_EMAIL_PAUSED_BANNER =
  "Email notifications are currently paused in Communication Preferences. Your individual Watch settings are preserved.";

/**
 * Stored entity switches are independent of the legacy global pause flag.
 * Global OFF must not force entity switches OFF in the UI.
 */
export function deriveStoredEntityAlertUi(input: {
  globalEmailEnabled: boolean;
  propertyEmailAlerts: boolean;
  areaEmailAlerts: boolean;
  savedSearchEmailAlerts: boolean;
}) {
  return {
    showGlobalPauseBanner: !input.globalEmailEnabled,
    propertyEmailSwitchChecked: input.propertyEmailAlerts,
    areaEmailSwitchChecked: input.areaEmailAlerts,
    savedSearchEmailSwitchChecked: input.savedSearchEmailAlerts,
  };
}

/** Mutation key: entity + setting so Area fields do not share one generation. */
export function entityAlertMutationKey(
  kind: "property" | "area" | "saved-search",
  entityId: string,
  field: string,
): string {
  return `${kind}:${entityId}:${field}`;
}

/**
 * Simulate the shared optimistic apply loop (generation-gated).
 * Used by selftests to prove race scenarios without mounting React.
 */
export function applyToggleResponseToUiState<T>(input: {
  uiState: T;
  generation: number;
  latestGeneration: number;
  previous: T;
  serverConfirmed: T | null;
}): { uiState: T; applied: boolean; rolledBack: boolean; ignoredStale: boolean } {
  const resolved = resolveToggleMutationOutcome({
    generation: input.generation,
    latestGeneration: input.latestGeneration,
    previous: input.previous,
    serverConfirmed: input.serverConfirmed,
  });
  if (resolved == null) {
    return {
      uiState: input.uiState,
      applied: false,
      rolledBack: false,
      ignoredStale: true,
    };
  }
  const rolledBack =
    input.serverConfirmed == null && resolved === input.previous;
  return {
    uiState: resolved,
    applied: true,
    rolledBack,
    ignoredStale: false,
  };
}
