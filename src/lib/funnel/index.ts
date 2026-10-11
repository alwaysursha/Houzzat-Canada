export {
  FUNNEL_EVENT_NAMES,
  FUNNEL_CLIENT_EVENT_NAMES,
  FUNNEL_SERVER_ONLY_EVENT_NAMES,
  FUNNEL_META_ALLOWED_KEYS,
  isFunnelEventsEnabled,
  type FunnelEventName,
} from "./constants";

export {
  FunnelSanitizeError,
  parseClientFunnelPayload,
  sanitizeFunnelMeta,
  cleanOpaqueKey,
  cleanMlsNumber,
  isFunnelEventName,
  isClientAllowedFunnelEvent,
  isServerOnlyFunnelEvent,
} from "./sanitize";

export {
  FUNNEL_CLIENT_DEDUPE_PREFIX,
  buildClientFunnelDedupeKey,
  buildRegistrationCompletedDedupeKey,
  buildPostRegistrationContinuedDedupeKey,
  buildRegistrationEngagedDedupeKey,
} from "./dedupe";

export {
  FUNNEL_CONTINUATION_WINDOW_MS,
  FUNNEL_ENGAGEMENT_WINDOW_MS,
  FUNNEL_ENGAGEMENT_TYPES,
  FUNNEL_CONTINUATION_INTENT_TYPES,
  isFunnelEngagementType,
  isFunnelContinuationIntentType,
  isEligibleFunnelConsumer,
  resolveFunnelConsumerEligibility,
  isWithinFunnelAttributionWindow,
  resolveFunnelWorkspaceId,
  recordPostRegistrationContinuedEvent,
  recordPostRegistrationContinuedEventSafe,
  recordRegistrationEngagedEvent,
  recordRegistrationEngagedEventSafe,
  scheduleRegistrationEngaged,
  type FunnelEngagementType,
  type FunnelContinuationIntentType,
  type FunnelEligibilityDb,
} from "./phase2c";

export {
  resolveListingLinkClickAction,
  shouldReportRegistrationGateShown,
  shouldReportRegistrationStarted,
} from "./client-signals";

export {
  writeFunnelEvent,
  ingestClientFunnelEvent,
  recordRegistrationCompletedEvent,
  recordRegistrationCompletedEventSafe,
  type FunnelIngestResult,
  type FunnelWriteInput,
} from "./ingest";

export {
  allowFunnelIngest,
  clearFunnelRateLimitsForTests,
  clientIpFromPublicRequest,
} from "./rate-limit";
