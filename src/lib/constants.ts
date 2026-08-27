/** Houzzat = the Houzzat real-estate tenant/brand (consumer marketplace). */
export const SITE_NAME = "Houzzat";
/**
 * HouzzatPRO = the SaaS platform/product (staff CRM / Command Centre chrome).
 * Do not use for WorkspaceBranding.displayName or Houzzat tenant identity.
 */
export const PLATFORM_PRODUCT_NAME = "HouzzatPRO";
export const SITE_DESCRIPTION =
  "Search GTA homes, open houses, and neighbourhood insights — then connect with a local agent when you’re ready.";
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";

export {
  isAdminRole,
  isAgentRole,
  isStaffRole,
  isConsumerRole,
  canAccessBuyerTools,
  canAccessSellerTools,
  resolveActiveMode,
  homePathForUser,
  STAFF_ROLES,
  CONSUMER_ROLES,
} from "@/lib/roles";

export const ADMIN_ROLES = ["ADMIN"] as const;
export const AGENT_ROLES = ["AGENT", "ADMIN"] as const;
