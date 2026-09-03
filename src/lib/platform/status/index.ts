export {
  PLATFORM_SUSPENDED_PAGE_TITLE,
  PLATFORM_SUSPENDED_PRIMARY_MESSAGE,
  PLATFORM_SUSPENDED_SUPPORT_PROMPT,
  PLATFORM_SUSPENDED_SECONDARY_MESSAGE,
  PLATFORM_SUSPENDED_DOCUMENT_TITLE,
} from "./copy";

export {
  HOUZZATPRO_TECHNICAL_SUPPORT_URL,
  HOUZZATPRO_TECHNICAL_SUPPORT_LABEL,
  resolveHouzzatProSupportCta,
  type HouzzatProSupportCta,
} from "./support";

export {
  HOUZZATPRO_SUPPORT_PAGE_TITLE,
  HOUZZATPRO_SUPPORT_PAGE_INTRO,
  HOUZZATPRO_SUPPORT_PAGE_PENDING_CONTACT,
  HOUZZATPRO_SUPPORT_DOCUMENT_TITLE,
} from "./support-copy";

export { isHouzzatProPlatformSupportRequest } from "./platform-support-request";

export {
  isPlatformSuspendedHostRequest,
  isPlatformSuspendedHostFromHeaders,
  resolvePlatformSuspendedHost,
} from "./resolve-suspended-host";
