import type { SignupAcquisitionChannel } from "@/lib/platform/signup-analytics/constants";
import type { SignupAnalyticsPreset } from "@/lib/platform/signup-analytics/range";

export type SignupAnalyticsReport = {
  meta: {
    timeZone: string;
    timeZoneLabel: string;
    preset: SignupAnalyticsPreset;
    from: string | null;
    to: string;
    workspaceId: string | null;
    generatedAt: string;
    classificationNotes: string[];
    indexRecommendations: string[];
  };
  totals: {
    /** Consumer signups in the selected range (or all-time when preset=all). */
    inRange: number;
    /** All-time consumer signups (optionally tenant-filtered). */
    allTime: number;
    /**
     * Current-period KPIs (America/Toronto), always relative to report
     * generation time — independent of the selected historical range.
     */
    currentPeriod: {
      today: number;
      last7Days: number;
      last30Days: number;
    };
  };
  verification: {
    emailVerified: number;
    emailUnverified: number;
    /** Consumer SMS OTP ownership verification (`phoneOtpVerifiedAt`). */
    phoneOtpVerified: number;
    phoneOtpUnverified: number;
    /** Agent-confirmed CRM phone (`phoneVerifiedAt`) — not OTP. */
    phoneAgentConfirmed: number;
  };
  acquisition: Array<{
    channel: SignupAcquisitionChannel;
    count: number;
  }>;
  /** Aggregate UTM / click-ID dimensions (no PII). Empty when unavailable. */
  attributionDimensions: {
    utmSources: Array<{ value: string; count: number }>;
    utmMediums: Array<{ value: string; count: number }>;
    utmCampaigns: Array<{ value: string; count: number }>;
    clickIds: {
      withGclid: number;
      withGbraid: number;
      withWbraid: number;
      withAnyClickId: number;
    };
  };
  byTenant: Array<{
    workspaceId: string;
    workspaceName: string;
    workspaceSlug: string | null;
    count: number;
  }>;
  /** Control-plane workspace list for tenant filter (not CRM). */
  workspaces: Array<{
    id: string;
    name: string;
    slug: string | null;
  }>;
  trend: Array<{
    date: string;
    count: number;
  }>;
  /** Selected tenant detail when filtered; null for all-tenants view. */
  tenantDetail: {
    workspaceId: string;
    workspaceName: string;
    workspaceSlug: string | null;
    inRange: number;
    allTime: number;
    emailVerified: number;
    phoneOtpVerified: number;
    phoneAgentConfirmed: number;
    acquisition: Array<{ channel: SignupAcquisitionChannel; count: number }>;
  } | null;
};
