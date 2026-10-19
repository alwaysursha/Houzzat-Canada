export {
  emailFromAlerts,
  emailFromNotify,
  fromForStream,
  isResendConfigured,
  type EmailStream,
} from "@/lib/email/config";
export {
  EMAIL_HERO_HOUSE_MARK_DARK_GREEN_PATH,
  formatEmailFooterNoteHtml,
  resolveEmailHeroLogoUrl,
} from "@/lib/email/layout";
export {
  EMAIL_PREHEADER_MAX_CHARS,
  EMAIL_PREHEADER_TARGET_MIN_CHARS,
  formatHiddenEmailPreheaderHtml,
  normalizeEmailPreheaderKey,
  resolveEmailPreheader,
  stripHtmlToEmailPreviewText,
} from "@/lib/email/preheader";
export {
  emailPreferencesUrl,
  emailPreviewAbsoluteUrl,
  emailPreviewPath,
  logClientEmail,
} from "@/lib/email/log";
export { sendRenderedEmail, type SendEmailResult } from "@/lib/email/send";
export * from "@/lib/email/templates";
export {
  absoluteEmailAssetUrl,
  appendAgentSignatureHtml,
  appendAgentSignatureText,
  appendEmailFooterText,
  assembleTenantEmailBrand,
  buildAgentEmailSignature,
  buildTelHref,
  isTenantEmailBrandingEnabled,
  isTenantEmailBrandingEnabledForWorkspace,
  isValidReplyToEmail,
  normalizeTenantEmailFooterLegalText,
  resolveTenantEmailBrand,
  toEmailBrandChrome,
  type EmailBrandChrome,
  type TenantEmailAgentIdentity,
  type TenantEmailBrand,
} from "@/lib/email/tenant-email-brand";
