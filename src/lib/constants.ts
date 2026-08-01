export const SITE_NAME = "Houzzat";
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
