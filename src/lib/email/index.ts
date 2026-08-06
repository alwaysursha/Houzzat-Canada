export {
  emailFromAlerts,
  emailFromNotify,
  fromForStream,
  isResendConfigured,
  type EmailStream,
} from "@/lib/email/config";
export {
  emailPreferencesUrl,
  emailPreviewAbsoluteUrl,
  emailPreviewPath,
  logClientEmail,
} from "@/lib/email/log";
export { sendRenderedEmail, type SendEmailResult } from "@/lib/email/send";
export * from "@/lib/email/templates";
