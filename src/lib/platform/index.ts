/**
 * Stage 6.2A — Platform control-plane module boundary.
 *
 * HARD RULES:
 * - PlatformOperator authority ≠ User.role=ADMIN CRM powers
 * - Never auto-create tenant CRM membership for PlatformOperator
 * - Do NOT import tenant CRM lead loaders from platform modules
 *
 * Forbidden imports (enforced by stage-6.1 / 6.2a boundary tests):
 * - @/lib/agent/lead-summary
 * - @/lib/crm-read-scope
 * - @/lib/agent (CRM agent-context path)
 */

export const PLATFORM_MODULE_BOUNDARY = {
  version: "6.5B.1",
  forbidsTenantCrmImports: true,
} as const;

export {
  HOUZZAT_LEGACY_BILLING_CUSTOMER_EMAIL,
  PLATFORM_MASTER_ADMIN_EMAIL,
  normalizeActivationEmail,
} from "./activation/constants";

export {
  evaluateOwnerActivationEligibility,
  sendOwnerActivationEmail,
  tryAutoSendOwnerActivationAfterProvision,
  resolvePublicOwnerActivation,
  completeOwnerActivation,
  OwnerActivationError,
  OWNER_ACTIVATION_AUDIT,
} from "./activation";

export type { PlatformOperatorContext } from "./auth/require-platform-operator";
export {
  requirePlatformOperator,
  resolvePlatformOperatorForUser,
  assertActiveMasterAdminOperator,
  PlatformOperatorAuthError,
} from "./auth/require-platform-operator";

export {
  HOUZZAT_LEGACY_ENTITLEMENT_PROFILE,
  HOUZZAT_LEGACY_PROFILE_READY,
  HOUZZAT_LEGACY_INCLUDED_SEATS,
  HOUZZAT_LEGACY_ADDITIONAL_SEATS,
  HOUZZAT_LEGACY_ADDITIONAL_SEATS_ALLOWED,
  HOUZZAT_LEGACY_SEAT_LIMIT,
  EntitlementProfileIncompleteError,
  getHouzzatLegacyOwnerDecisionsRequired,
  isHouzzatLegacyProfileReady,
  resolveHouzzatLegacyEntitlementProfile,
  resolvePlanEntitlementProfile,
  type EntitlementProfileCode,
  type MaterializedEntitlementProfile,
} from "./entitlements/profiles";

export {
  workspaceHasFeature,
  getWorkspaceSeatQuota,
  getCurrentWorkspaceSubscription,
  type WorkspaceSeatQuotaView,
} from "./entitlements";

export { materializeEntitlementProfile } from "./entitlements/materialize";

export {
  getWorkspaceSeatConsumption,
  planAllowsSeatExpansion,
  assertAdditionalSeatAllowedForPlan,
  WORKSPACE_INVITE_TTL_MS,
  type SeatConsumptionBreakdown,
} from "./seats";

export {
  PLAN_DEFINITIONS,
  STANDARD_SETUP_FEE_CENTS,
  ADDITIONAL_AGENT_ANNUAL_CENTS,
  ADDITIONAL_AGENT_MONTHLY_CENTS,
  getAdditionalAgentUnitCents,
  getPlanDefinition,
  planAllowsAdditionalSeats,
  planFeatureEnabled,
  computeSeatLimit,
} from "./catalog/plans";

export {
  FEATURE_LIVE_CHAT,
  FEATURE_SEO_FOUNDATION,
  FEATURE_AGENT_APP,
  FEATURE_TEAM_MANAGEMENT,
  FEATURE_CUSTOM_CONSUMER_APP,
  PLATFORM_FEATURE_CODES,
  type PlatformFeatureCode,
} from "./catalog/features";

export {
  grandfatherHouzzatWorkspace,
  grandfatherWorkspaceWithProfile,
  HOUZZAT_WORKSPACE_SLUG,
  createCheckoutForAcceptedOffer,
  computeAcceptedCheckoutAmounts,
  processStripeWebhook,
  STRIPE_BILLING_AUDIT,
  BROWSER_SUCCESS_CANNOT_ACTIVATE,
} from "./billing";

export { provisionPlatformMasterAdmin } from "./operators/provision-master-admin";

export {
  PLATFORM_PROVISIONING_MODULE,
  PROVISIONING_STEP_KEYS,
  PROVISIONING_AUDIT,
  evaluatePaidSubscriptionProvisioningEligibility,
  provisionPaidSubscription,
  tryProvisionAfterBillingActivation,
  retryPaidSubscriptionProvisioning,
  ProvisioningActionError,
} from "./provisioning";

export {
  writePlatformAuditEvent,
  PLATFORM_AUDIT_NO_CRM_CONTENT,
} from "./audit";

export {
  isPlatformSuspendedHostRequest,
  isPlatformSuspendedHostFromHeaders,
  resolvePlatformSuspendedHost,
  PLATFORM_SUSPENDED_PAGE_TITLE,
  PLATFORM_SUSPENDED_PRIMARY_MESSAGE,
  PLATFORM_SUSPENDED_SUPPORT_PROMPT,
  PLATFORM_SUSPENDED_SECONDARY_MESSAGE,
  PLATFORM_SUSPENDED_DOCUMENT_TITLE,
  HOUZZATPRO_TECHNICAL_SUPPORT_URL,
  HOUZZATPRO_TECHNICAL_SUPPORT_LABEL,
  resolveHouzzatProSupportCta,
  HOUZZATPRO_SUPPORT_PAGE_TITLE,
  HOUZZATPRO_SUPPORT_PAGE_INTRO,
  HOUZZATPRO_SUPPORT_PAGE_PENDING_CONTACT,
  HOUZZATPRO_SUPPORT_DOCUMENT_TITLE,
  isHouzzatProPlatformSupportRequest,
} from "./status";

export {
  WORKSPACE_SUSPEND_REASON_MIN,
  WORKSPACE_SUSPEND_REASON_MAX,
  WORKSPACE_REACTIVATE_REASON_MAX,
  WorkspaceStatusActionError,
  validateSuspendReason,
  validateReactivateReason,
  isBillingControlledSuspension,
  resolveManualReactivationEligibility,
  suspendWorkspace,
  reactivateWorkspace,
  getLatestSuspensionReasonCodeForWorkspace,
  type WorkspaceStatusActionResult,
} from "./workspaces";

export { normalizeProspectEmail } from "./prospects/normalize-email";

export {
  PlatformProspectActionError,
  createOrReopenPlatformProspect,
  updatePlatformProspect,
  changePlatformProspectStatus,
  schedulePlatformProspectDemo,
  completePlatformProspectDemo,
  markPlatformProspectDemoNoShow,
  cancelPlatformProspectDemo,
  applyPlatformProspectDemoAction,
  addPlatformProspectInternalNote,
  validateContactName,
  validateProspectEmail,
  validateProspectSource,
  validateProspectStatus,
  validateEstimatedTeamSize,
  validateWebsite,
  validateNotesInternal,
  validateNoteBody,
  validateScheduledAt,
  validateDemoAction,
  PROSPECT_STATUSES,
  PROSPECT_SOURCES,
  PROSPECT_DEMO_ACTIONS,
  PROSPECT_CONTACT_NAME_MIN,
  PROSPECT_CONTACT_NAME_MAX,
  PROSPECT_NOTE_BODY_MIN,
  PROSPECT_NOTE_BODY_MAX,
  PROSPECT_NOTES_INTERNAL_MAX,
  type CreateOrReopenProspectResult,
  type ProspectMutationResult,
  type ProspectStatusValue,
  type ProspectSourceValue,
  type ProspectDemoActionValue,
} from "./prospects";

export {
  BOOK_DEMO_PATH,
  BOOK_DEMO_PAGE_TITLE,
  BOOK_DEMO_ACTIVITY_SUMMARY,
  BOOK_DEMO_HONEYPOT_FIELD,
  isHouzzatProPlatformBookDemoRequest,
  BookDemoPublicError,
  assertBookDemoPlatformHostname,
  receiveWebsiteDemoRequest,
  allowBookDemoRequest,
  clearBookDemoRateLimitsForTests,
  clientIpFromPublicRequest,
  notifyBookDemoEmails,
  BOOK_DEMO_EMAIL_AUDIT,
  BOOK_DEMO_TURNSTILE_ACTION,
  BOOK_DEMO_TURNSTILE_ERROR_MESSAGE,
  verifyTurnstileToken,
  assertTurnstileSiteverifyContext,
  readTurnstileSiteKey,
  TURNSTILE_TEST_SITE_KEY_PASS,
  TURNSTILE_TEST_SECRET_KEY_PASS,
  TURNSTILE_TEST_SECRET_KEY_FAIL,
  TURNSTILE_TEST_DUMMY_TOKEN,
} from "./public";

export { platformOk, platformError } from "./api/response";
export {
  DEFAULT_PLATFORM_LIST_LIMIT,
  MAX_PLATFORM_LIST_LIMIT,
  parsePlatformListParams,
} from "./api/pagination";
export {
  PlatformApiError,
  toPlatformHttpError,
  withPlatformOperator,
} from "./api/handler";
export {
  getPlatformMe,
  getPlatformSummary,
  listPlatformWorkspaces,
  getPlatformWorkspaceDetail,
  getPlatformWorkspaceBySlug,
  listPlatformProspects,
  getPlatformProspectDetail,
  listPlatformOffers,
  getPlatformOfferDetail,
  listPlatformSubscriptionsFiltered,
  getPlatformSubscriptionDetail,
  listPlatformProvisioningRuns,
  getPlatformProvisioningRunDetail,
  listPlatformAuditEvents,
  PLATFORM_READ_BOUNDARY,
} from "./read";

export {
  PLATFORM_OFFERS_MODULE,
  COMMERCIAL_OFFER_AUDIT,
  CommercialOfferActionError,
  createDraftCommercialOffer,
  updateDraftCommercialOffer,
  sendCommercialOffer,
  cancelCommercialOffer,
  resolveOfferCommercialTerms,
  computeOfferTotals,
  createCommercialOfferRawToken,
  hashCommercialOfferToken,
  buildPrivateOfferUrl,
  ADS_MINIMUM_MONTHLY_BUDGET_CENTS,
  resolvePrivateOfferByRawToken,
  acceptPrivateOfferByRawToken,
  computeCommercialTermsHash,
} from "./offers";
