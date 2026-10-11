export {
  FUNNEL_ANALYTICS_TIME_ZONE,
  FUNNEL_ANALYTICS_TIME_ZONE_LABEL,
  FUNNEL_ANALYTICS_ENGAGEMENT_TYPES,
  FUNNEL_ANALYTICS_UNINSTRUMENTED_STAGES,
  FUNNEL_ANALYTICS_STAGE_ORDER,
  FUNNEL_ANALYTICS_STAGE_LABELS,
  FUNNEL_ANALYTICS_STAGE_PRIMARY_UNIT,
  FUNNEL_ANALYTICS_CLASSIFICATION_NOTES,
  FUNNEL_ANALYTICS_INDEX_NOTES,
  type FunnelAnalyticsStageId,
} from "./constants";

export {
  evaluateConversionRate,
  safeConversionRate,
  classifyGateIdentityCoverage,
  buildGateToCompletedConversion,
  buildCompletedToContinuedConversion,
  buildCompletedToEngagedConversion,
  buildSearchToListingDetailConversion,
  formatConversionPercent,
  isEngagementObservationComplete,
  tenantScopedIdentityKey,
  countDistinctTenantScopedKeys,
  countCohortEngagedUsers,
  countGateToCompletedFromFixtures,
  countSearchToListingFromFixtures,
} from "./conversions";

export type {
  FunnelIdentityCoverageKind,
} from "./types";

export {
  getFunnelAnalyticsReport,
  type FunnelAnalyticsQueryInput,
} from "./query";

export type {
  FunnelAnalyticsReport,
  FunnelStageMetric,
  FunnelConversionMetric,
  FunnelStageStatus,
  FunnelConversionStatus,
} from "./types";
