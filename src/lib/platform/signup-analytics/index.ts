export {
  SIGNUP_ANALYTICS_TIME_ZONE,
  SIGNUP_ANALYTICS_TIME_ZONE_LABEL,
  SIGNUP_ANALYTICS_CONSUMER_ROLES,
  SIGNUP_ACQUISITION_CHANNELS,
  SIGNUP_ANALYTICS_CLASSIFICATION_NOTES,
  SIGNUP_ANALYTICS_INDEX_RECOMMENDATIONS,
  type SignupAcquisitionChannel,
} from "./constants";

export {
  isConsumerSignupRole,
  classifySignupAcquisition,
  extractAttributionFromCaptureContext,
  type SignupAttributionSignals,
} from "./classify";

export {
  resolveSignupAnalyticsRange,
  formatYmdInZone,
  zonedDayStartUtc,
  enumerateZonedDays,
  SIGNUP_ANALYTICS_MAX_CUSTOM_RANGE_DAYS,
  SignupAnalyticsRangeError,
  type SignupAnalyticsPreset,
  type SignupAnalyticsRange,
} from "./range";

export {
  buildConsumerSignupWhere,
  getSignupAnalyticsReport,
  SignupAnalyticsQueryError,
  type SignupAnalyticsQueryInput,
} from "./query";

export type { SignupAnalyticsReport } from "./types";
