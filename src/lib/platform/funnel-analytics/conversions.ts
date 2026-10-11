/**
 * Pure conversion-rate helpers for Phase 2D.
 * Only identity-linked cohorts — never raw unrelated event totals.
 */

import { FUNNEL_ENGAGEMENT_WINDOW_MS } from "@/lib/funnel/phase2c";
import type { FunnelConversionMetric } from "@/lib/platform/funnel-analytics/types";

export type ConversionRateEvaluation =
  | { status: "ok"; rate: number }
  | { status: "zero_denominator"; rate: null }
  | { status: "invalid_cohort"; rate: null }
  | { status: "negative_input"; rate: null };

/**
 * Evaluate a conversion rate without silently clamping above 100%.
 * numerator > denominator → invalid_cohort (not capped).
 */
export function evaluateConversionRate(
  numerator: number,
  denominator: number,
): ConversionRateEvaluation {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return { status: "negative_input", rate: null };
  }
  if (numerator < 0 || denominator < 0) {
    return { status: "negative_input", rate: null };
  }
  if (denominator <= 0) {
    return { status: "zero_denominator", rate: null };
  }
  if (numerator > denominator) {
    return { status: "invalid_cohort", rate: null };
  }
  return { status: "ok", rate: numerator / denominator };
}

/** @deprecated Prefer evaluateConversionRate — kept for call-site clarity in tests. */
export function safeConversionRate(
  numerator: number,
  denominator: number,
): number | null {
  const result = evaluateConversionRate(numerator, denominator);
  return result.rate;
}

export type GateIdentityCoverage = {
  /** Distinct registration_completed users in the selected period. */
  completedUsers: number;
  /** Subset with non-null visitorKey (linkable to gate_shown). */
  completedUsersWithVisitorKey: number;
};

export type GateIdentityCoverageKind =
  | "complete"
  | "partial"
  | "none"
  | "no_completions";

/** Classify registration_completed visitorKey coverage (not gate-outcome coverage). */
export function classifyGateIdentityCoverage(
  identity: GateIdentityCoverage,
): GateIdentityCoverageKind {
  if (identity.completedUsers <= 0) return "no_completions";
  if (identity.completedUsersWithVisitorKey <= 0) return "none";
  if (identity.completedUsersWithVisitorKey < identity.completedUsers) {
    return "partial";
  }
  return "complete";
}

function gateCoverageNote(
  identity: GateIdentityCoverage,
  kind: GateIdentityCoverageKind,
): string {
  const n = identity.completedUsersWithVisitorKey;
  const m = identity.completedUsers;
  switch (kind) {
    case "no_completions":
      return "Linked-registration coverage: 0/0 — no registration_completed users in period.";
    case "none":
      return `Linked-registration coverage: ${n}/${m} — no usable visitorKey on completions. Missing visitorKey cannot prove a gate visitor converted.`;
    case "partial":
      return `Linked-registration coverage: ${n}/${m} completed users have visitorKey. Rate is an observed matched rate among linkable completions only — not a definitive conversion rate.`;
    case "complete":
      return `Linked-registration coverage: ${n}/${m} completed users have visitorKey. Complete registration identity coverage does not guarantee every gate visitor's eventual outcome was observed (unmatched gate visitors and cross-midnight exclusions remain).`;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/**
 * Same-period linked conversion: gate visitors → registration completed.
 * Tenant-scoped visitorKey matching only — never invents missing keys.
 */
export function buildGateToCompletedConversion(input: {
  convertedVisitors: number;
  gateVisitors: number;
  identity: GateIdentityCoverage;
}): FunnelConversionMetric {
  const coverageKind = classifyGateIdentityCoverage(input.identity);
  const coverage =
    input.identity.completedUsers > 0
      ? input.identity.completedUsersWithVisitorKey /
        input.identity.completedUsers
      : null;
  const coverageNote = gateCoverageNote(input.identity, coverageKind);

  const cohortBase =
    "Same-period linked conversion: visitorKey on registration_gate_shown (in range) matched to registration_completed in the same workspace and period. Cross-midnight journeys may be excluded.";

  if (input.gateVisitors <= 0) {
    return {
      id: "gate_to_completed",
      label: "Listing gate → registration completed",
      status: "insufficient_data",
      reason:
        "No registration_gate_shown visitors with visitorKey in the selected period.",
      numerator: null,
      denominator: null,
      rate: null,
      rateKind: "none",
      cohortNote: cohortBase,
      identityCoverage: coverage,
      identityCoverageKind: coverageKind,
      identityCoverageNote: coverageNote,
    };
  }

  // Completions exist but none are linkable → Insufficient data (not 0%).
  if (coverageKind === "none") {
    return {
      id: "gate_to_completed",
      label: "Listing gate → registration completed",
      status: "insufficient_data",
      reason:
        "No usable identity coverage: registration_completed rows in this period lack visitorKey, so gate visitors cannot be linked. Showing 0% would be misleading.",
      numerator: null,
      denominator: null,
      rate: null,
      rateKind: "none",
      cohortNote: cohortBase,
      identityCoverage: 0,
      identityCoverageKind: "none",
      identityCoverageNote: coverageNote,
    };
  }

  const evaluated = evaluateConversionRate(
    input.convertedVisitors,
    input.gateVisitors,
  );
  if (evaluated.status === "invalid_cohort") {
    return {
      id: "gate_to_completed",
      label: "Listing gate → registration completed",
      status: "insufficient_data",
      reason:
        "Invalid cohort: linked conversions exceed gate visitors (numerator > denominator).",
      numerator: input.convertedVisitors,
      denominator: input.gateVisitors,
      rate: null,
      rateKind: "none",
      cohortNote: cohortBase,
      identityCoverage: coverage,
      identityCoverageKind: coverageKind,
      identityCoverageNote: coverageNote,
    };
  }
  if (evaluated.status !== "ok") {
    return {
      id: "gate_to_completed",
      label: "Listing gate → registration completed",
      status: "insufficient_data",
      reason: "Unable to evaluate gate→completed rate.",
      numerator: null,
      denominator: null,
      rate: null,
      rateKind: "none",
      cohortNote: cohortBase,
      identityCoverage: coverage,
      identityCoverageKind: coverageKind,
      identityCoverageNote: coverageNote,
    };
  }

  if (coverageKind === "partial") {
    return {
      id: "gate_to_completed",
      label: "Listing gate → registration completed (observed matched rate)",
      status: "available",
      reason:
        "Partial identity coverage — this is an observed matched rate among completions that retained visitorKey, not a definitive conversion rate for all gate visitors or all registrations.",
      numerator: input.convertedVisitors,
      denominator: input.gateVisitors,
      rate: evaluated.rate,
      rateKind: "observed_matched",
      cohortNote: `${cohortBase} Partial linkage only.`,
      identityCoverage: coverage,
      identityCoverageKind: "partial",
      identityCoverageNote: coverageNote,
    };
  }

  // complete or no_completions (gates with zero registrations → genuine linked 0%)
  return {
    id: "gate_to_completed",
    label: "Listing gate → registration completed",
    status: "available",
    reason:
      coverageKind === "complete"
        ? "Usable identity coverage is complete for in-period completions. This still does not claim every gate visitor was later observed as registered or not."
        : null,
    numerator: input.convertedVisitors,
    denominator: input.gateVisitors,
    rate: evaluated.rate,
    rateKind: "definitive_linked",
    cohortNote: cohortBase,
    identityCoverage: coverage,
    identityCoverageKind: coverageKind,
    identityCoverageNote: coverageNote,
  };
}

export function buildCompletedToContinuedConversion(input: {
  continuedUsers: number;
  registeredUsers: number;
}): FunnelConversionMetric {
  return buildRegistrationCohortConversion({
    id: "completed_to_continued",
    label: "Registration completed → post-registration continued",
    numerator: input.continuedUsers,
    denominator: input.registeredUsers,
    emptyReason: "No registration_completed users in the selected range.",
    cohortNote:
      "Registration-cohort outcome: distinct userId with registration_completed in the selected period who also have post_registration_continued in the same workspace within the 45-minute continuation window.",
  });
}

export function buildCompletedToEngagedConversion(input: {
  engagedUsers: number;
  registeredUsers: number;
  observationComplete?: boolean;
}): FunnelConversionMetric {
  const observationNote = input.observationComplete
    ? "All registrations in this cohort have had a full 7-day engagement observation window."
    : "Observed-to-date cohort rate — some registrations have not had a full 7-day engagement window yet.";

  return buildRegistrationCohortConversion({
    id: "completed_to_engaged",
    label: "Registration completed → meaningfully engaged",
    numerator: input.engagedUsers,
    denominator: input.registeredUsers,
    emptyReason: "No registration_completed users in the selected range.",
    cohortNote: `Registration-cohort outcome: distinct userId with registration_completed in the selected period who subsequently have registration_engaged (any type) in the same workspace within the 7-day engagement window. ${observationNote}`,
  });
}

export function buildSearchToListingDetailConversion(input: {
  convertedSessions: number;
  searchSessions: number;
}): FunnelConversionMetric {
  return buildRegistrationCohortConversion({
    id: "search_to_listing_detail",
    label: "Search → listing detail opened",
    numerator: input.convertedSessions,
    denominator: input.searchSessions,
    emptyReason:
      "No search_results_viewed sessions with sessionKey in the selected period.",
    cohortNote:
      "Same-period linked conversion: sessionKey with search_results_viewed (in range) matched to listing_detail_opened in the same workspace and period. Cross-midnight journeys may be excluded.",
  });
}

function buildRegistrationCohortConversion(input: {
  id: string;
  label: string;
  numerator: number;
  denominator: number;
  emptyReason: string;
  cohortNote: string;
}): FunnelConversionMetric {
  const evaluated = evaluateConversionRate(input.numerator, input.denominator);
  if (evaluated.status === "zero_denominator") {
    return {
      id: input.id,
      label: input.label,
      status: "insufficient_data",
      reason: input.emptyReason,
      numerator: null,
      denominator: null,
      rate: null,
      rateKind: "none",
      cohortNote: input.cohortNote,
      identityCoverage: null,
      identityCoverageKind: "not_applicable",
      identityCoverageNote: null,
    };
  }
  if (evaluated.status === "invalid_cohort") {
    return {
      id: input.id,
      label: input.label,
      status: "insufficient_data",
      reason:
        "Invalid cohort: numerator exceeds denominator (population mismatch).",
      numerator: input.numerator,
      denominator: input.denominator,
      rate: null,
      rateKind: "none",
      cohortNote: input.cohortNote,
      identityCoverage: null,
      identityCoverageKind: "not_applicable",
      identityCoverageNote: null,
    };
  }
  if (evaluated.status !== "ok") {
    return {
      id: input.id,
      label: input.label,
      status: "insufficient_data",
      reason: "Unable to evaluate conversion rate.",
      numerator: null,
      denominator: null,
      rate: null,
      rateKind: "none",
      cohortNote: input.cohortNote,
      identityCoverage: null,
      identityCoverageKind: "not_applicable",
      identityCoverageNote: null,
    };
  }
  return {
    id: input.id,
    label: input.label,
    status: "available",
    reason: null,
    numerator: input.numerator,
    denominator: input.denominator,
    rate: evaluated.rate,
    rateKind: "definitive_linked",
    cohortNote: input.cohortNote,
    identityCoverage: null,
    identityCoverageKind: "not_applicable",
    identityCoverageNote: null,
  };
}

export function formatConversionPercent(rate: number | null): string {
  if (rate == null || !Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * Pure: whether every registration in the cohort has had a full 7-day
 * engagement observation window ending at `now`.
 */
export function isEngagementObservationComplete(input: {
  /** ISO or Date of the newest registration_completed in the cohort. */
  newestRegistrationAt: Date | null;
  now: Date;
  windowMs?: number;
}): boolean {
  if (!input.newestRegistrationAt) return true;
  const windowMs = input.windowMs ?? FUNNEL_ENGAGEMENT_WINDOW_MS;
  return (
    input.now.getTime() - input.newestRegistrationAt.getTime() >= windowMs
  );
}

/** Tenant-scoped identity key — never collapse the same raw key across workspaces. */
export function tenantScopedIdentityKey(
  workspaceId: string,
  identityKey: string,
): string {
  return `${workspaceId}::${identityKey}`;
}

/**
 * Pure: count distinct (workspaceId, key) identities — mirrors all-tenants SQL.
 * Optional workspaceId filter preserves single-tenant reporting.
 */
export function countDistinctTenantScopedKeys(input: {
  rows: Array<{ workspaceId: string; key: string | null | undefined }>;
  workspaceId?: string | null;
}): number {
  const filtered = input.rows.filter((r) => {
    if (!r.key) return false;
    if (input.workspaceId && r.workspaceId !== input.workspaceId) return false;
    return true;
  });
  return new Set(
    filtered.map((r) => tenantScopedIdentityKey(r.workspaceId, r.key as string)),
  ).size;
}

/**
 * Pure fixture helper for registration-cohort engagement tests.
 * Counts distinct (workspaceId, userId) registered in [from, to) who engaged
 * in the same workspace within the 7-day window after registration — never
 * users who registered before the period.
 */
export function countCohortEngagedUsers(input: {
  registrations: Array<{
    userId: string;
    workspaceId: string;
    occurredAt: Date;
  }>;
  engagements: Array<{
    userId: string;
    workspaceId: string;
    occurredAt: Date;
    engagementType?: string;
  }>;
  from: Date;
  to: Date;
  now?: Date;
  windowMs?: number;
  /** When set, only count that tenant (single-tenant reporting). */
  workspaceId?: string | null;
}): {
  registeredUsers: number;
  engagedUsers: number;
  rate: number | null;
  rateStatus: ConversionRateEvaluation["status"];
  observationComplete: boolean;
} {
  const windowMs = input.windowMs ?? FUNNEL_ENGAGEMENT_WINDOW_MS;
  const now = input.now ?? new Date();
  const inPeriod = input.registrations.filter(
    (r) =>
      r.occurredAt.getTime() >= input.from.getTime() &&
      r.occurredAt.getTime() < input.to.getTime() &&
      (!input.workspaceId || r.workspaceId === input.workspaceId),
  );
  const registeredIds = new Set(
    inPeriod.map((r) => tenantScopedIdentityKey(r.workspaceId, r.userId)),
  );
  const engaged = new Set<string>();
  for (const reg of inPeriod) {
    const windowEnd = reg.occurredAt.getTime() + windowMs;
    const identity = tenantScopedIdentityKey(reg.workspaceId, reg.userId);
    const hit = input.engagements.some(
      (e) =>
        e.userId === reg.userId &&
        e.workspaceId === reg.workspaceId &&
        e.occurredAt.getTime() >= reg.occurredAt.getTime() &&
        e.occurredAt.getTime() <= windowEnd,
    );
    if (hit) engaged.add(identity);
  }
  // Exclude anyone who only engaged but registered outside the period.
  for (const id of [...engaged]) {
    if (!registeredIds.has(id)) engaged.delete(id);
  }
  const registeredUsers = registeredIds.size;
  const engagedUsers = engaged.size;
  const evaluated = evaluateConversionRate(engagedUsers, registeredUsers);
  const newest = inPeriod.reduce<Date | null>((acc, r) => {
    if (!acc || r.occurredAt.getTime() > acc.getTime()) return r.occurredAt;
    return acc;
  }, null);
  return {
    registeredUsers,
    engagedUsers,
    rate: evaluated.rate,
    rateStatus: evaluated.status,
    observationComplete: isEngagementObservationComplete({
      newestRegistrationAt: newest,
      now,
      windowMs,
    }),
  };
}

/**
 * Pure fixture helper for gate→completed with identity coverage.
 * Distinct visitors/users are (workspaceId, key) — all-tenants safe.
 */
export function countGateToCompletedFromFixtures(input: {
  gates: Array<{ visitorKey: string; workspaceId: string; occurredAt: Date }>;
  completions: Array<{
    userId: string;
    visitorKey: string | null;
    workspaceId: string;
    occurredAt: Date;
  }>;
  from: Date;
  to: Date;
  /** When set, only count that tenant (single-tenant reporting). */
  workspaceId?: string | null;
}): {
  gateVisitors: number;
  convertedVisitors: number;
  completedUsers: number;
  completedUsersWithVisitorKey: number;
  metric: FunnelConversionMetric;
} {
  const gates = input.gates.filter(
    (g) =>
      g.occurredAt.getTime() >= input.from.getTime() &&
      g.occurredAt.getTime() < input.to.getTime() &&
      Boolean(g.visitorKey) &&
      (!input.workspaceId || g.workspaceId === input.workspaceId),
  );
  const completions = input.completions.filter(
    (c) =>
      c.occurredAt.getTime() >= input.from.getTime() &&
      c.occurredAt.getTime() < input.to.getTime() &&
      (!input.workspaceId || c.workspaceId === input.workspaceId),
  );
  const gateKeys = new Set(
    gates.map((g) => tenantScopedIdentityKey(g.workspaceId, g.visitorKey)),
  );
  const gateVisitors = gateKeys.size;
  const completedUsers = new Set(
    completions.map((c) => tenantScopedIdentityKey(c.workspaceId, c.userId)),
  ).size;
  const completedUsersWithVisitorKey = new Set(
    completions
      .filter((c) => c.visitorKey)
      .map((c) => tenantScopedIdentityKey(c.workspaceId, c.userId)),
  ).size;

  const converted = new Set<string>();
  for (const c of completions) {
    if (!c.visitorKey) continue;
    const key = tenantScopedIdentityKey(c.workspaceId, c.visitorKey);
    // Cross-tenant: visitorKey match only counts when workspace matches.
    if (gateKeys.has(key)) converted.add(key);
  }
  const convertedVisitors = converted.size;

  const metric = buildGateToCompletedConversion({
    convertedVisitors,
    gateVisitors,
    identity: { completedUsers, completedUsersWithVisitorKey },
  });

  return {
    gateVisitors,
    convertedVisitors,
    completedUsers,
    completedUsersWithVisitorKey,
    metric,
  };
}

/**
 * Pure fixture helper: search→listing same-period session conversion.
 * Distinct sessions are (workspaceId, sessionKey).
 */
export function countSearchToListingFromFixtures(input: {
  searches: Array<{
    sessionKey: string;
    workspaceId: string;
    occurredAt: Date;
  }>;
  details: Array<{
    sessionKey: string;
    workspaceId: string;
    occurredAt: Date;
  }>;
  from: Date;
  to: Date;
  workspaceId?: string | null;
}): {
  searchSessions: number;
  convertedSessions: number;
} {
  const searches = input.searches.filter(
    (s) =>
      s.occurredAt.getTime() >= input.from.getTime() &&
      s.occurredAt.getTime() < input.to.getTime() &&
      Boolean(s.sessionKey) &&
      (!input.workspaceId || s.workspaceId === input.workspaceId),
  );
  const detailKeys = new Set(
    input.details
      .filter(
        (d) =>
          d.occurredAt.getTime() >= input.from.getTime() &&
          d.occurredAt.getTime() < input.to.getTime() &&
          Boolean(d.sessionKey) &&
          (!input.workspaceId || d.workspaceId === input.workspaceId),
      )
      .map((d) => tenantScopedIdentityKey(d.workspaceId, d.sessionKey)),
  );
  const searchKeys = new Set(
    searches.map((s) => tenantScopedIdentityKey(s.workspaceId, s.sessionKey)),
  );
  let convertedSessions = 0;
  for (const key of searchKeys) {
    if (detailKeys.has(key)) convertedSessions += 1;
  }
  return {
    searchSessions: searchKeys.size,
    convertedSessions,
  };
}
