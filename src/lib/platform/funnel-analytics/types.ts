import type { SignupAcquisitionChannel } from "@/lib/platform/signup-analytics/constants";
import type { SignupAnalyticsPreset } from "@/lib/platform/signup-analytics/range";
import type {
  FunnelAnalyticsStageId,
} from "@/lib/platform/funnel-analytics/constants";
import type { FunnelEngagementType } from "@/lib/funnel/phase2c";

export type FunnelStageStatus = "available" | "unavailable";

export type FunnelStageMetric = {
  id: FunnelAnalyticsStageId;
  label: string;
  status: FunnelStageStatus;
  unavailableReason: string | null;
  primaryUnit: "sessions" | "visitors" | "users";
  /** Distinct count for the primary unit; null when unavailable. */
  primaryCount: number | null;
  eventCount: number;
  distinctVisitors: number;
  distinctSessions: number;
  distinctUsers: number;
};

export type FunnelConversionStatus = "available" | "insufficient_data";

/**
 * Gate→registration identity linkage quality for registration_completed rows.
 * - complete: every in-period completion has visitorKey (linkable)
 * - partial: some completions have visitorKey, some do not
 * - none: completions exist but none have visitorKey
 * - no_completions: no registration_completed users in period
 * - not_applicable: metric is not gate→registration
 */
export type FunnelIdentityCoverageKind =
  | "complete"
  | "partial"
  | "none"
  | "no_completions"
  | "not_applicable";

export type FunnelConversionMetric = {
  id: string;
  label: string;
  status: FunnelConversionStatus;
  reason: string | null;
  numerator: number | null;
  denominator: number | null;
  /** 0–1 when available; null otherwise. Never silently clamped. */
  rate: number | null;
  /**
   * How to interpret an available rate:
   * - definitive_linked: usable identity coverage supports a linked rate
   *   (still not a guarantee that every gate visitor's outcome was observed)
   * - observed_matched: partial identity — matched-only rate among linkable completions
   * - none: no rate
   */
  rateKind: "definitive_linked" | "observed_matched" | "none";
  cohortNote: string;
  /** Fraction of completed users with linkable visitorKey; null when N/A. */
  identityCoverage: number | null;
  identityCoverageKind: FunnelIdentityCoverageKind;
  /** Human-readable coverage, typically "N/M completed users have visitorKey". */
  identityCoverageNote: string | null;
};
export type FunnelAnalyticsReport = {
  meta: {
    timeZone: string;
    timeZoneLabel: string;
    preset: SignupAnalyticsPreset;
    from: string | null;
    to: string;
    workspaceId: string | null;
    generatedAt: string;
    /** Mirrors FUNNEL_EVENTS_ENABLED — does not enable tracking. */
    trackingEnabled: boolean;
    classificationNotes: string[];
    indexNotes: string[];
  };
  kpis: {
    /**
     * Registration-cohort denominator: distinct users with
     * registration_completed in the selected period.
     */
    registeredUsers: number;
    /**
     * Registration-cohort numerator: registeredUsers who continued
     * within the 45-minute continuation window.
     */
    continuedUsers: number;
    /**
     * Registration-cohort numerator: registeredUsers who engaged
     * within the 7-day engagement window (distinct across types).
     */
    engagedUsers: number;
    /** engagedUsers / registeredUsers when the cohort is valid. */
    engagementRate: number | null;
    /**
     * finalized = every registration has had a full 7-day window;
     * observed_to_date = some registrations are still inside the window.
     */
    engagementRateKind: "finalized" | "observed_to_date" | "unavailable";
    engagementRateLabel: string;
  };
  stages: FunnelStageMetric[];
  conversions: FunnelConversionMetric[];
  engagementByType: Array<{
    type: FunnelEngagementType;
    /** Distinct users with this engagement type (may overlap). */
    distinctUsers: number;
  }>;
  /**
   * Acquisition of users with registration_completed in range (Lead UTMs).
   * Not anonymous visitor attribution.
   */
  acquisitionOfConverters: Array<{
    channel: SignupAcquisitionChannel;
    count: number;
  }>;
  workspaces: Array<{
    id: string;
    name: string;
    slug: string | null;
  }>;
};
