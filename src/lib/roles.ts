import type { ActiveMode, Role } from "@prisma/client";

export const STAFF_ROLES = ["ADMIN", "AGENT"] as const;
export const CONSUMER_ROLES = ["BUYER", "SELLER"] as const;

export type ConsumerMode = ActiveMode;

export function isAdminRole(role: string | null | undefined) {
  return role === "ADMIN";
}

export function isAgentRole(role: string | null | undefined) {
  return role === "AGENT" || role === "ADMIN";
}

export function isStaffRole(role: string | null | undefined) {
  return role === "ADMIN" || role === "AGENT";
}

export function isConsumerRole(role: string | null | undefined) {
  return role === "BUYER" || role === "SELLER";
}

export function canAccessBuyerTools(user: {
  role: string;
  isBuyer?: boolean | null;
}) {
  if (isStaffRole(user.role)) return false;
  if (typeof user.isBuyer === "boolean") return user.isBuyer;
  return user.role === "BUYER" || user.role === "SELLER";
}

export function canAccessSellerTools(user: {
  role: string;
  isSeller?: boolean | null;
}) {
  if (user.role === "AGENT") return false;
  if (user.role === "ADMIN") return true;
  if (typeof user.isSeller === "boolean") return user.isSeller;
  return user.role === "SELLER";
}

export function resolveActiveMode(user: {
  role: Role | string;
  isBuyer?: boolean | null;
  isSeller?: boolean | null;
  activeMode?: ActiveMode | string | null;
}): ActiveMode {
  if (isStaffRole(user.role)) {
    return "BUYER";
  }
  const mode = user.activeMode === "SELLER" ? "SELLER" : "BUYER";
  if (mode === "SELLER" && canAccessSellerTools(user)) return "SELLER";
  if (mode === "BUYER" && canAccessBuyerTools(user)) return "BUYER";
  if (canAccessSellerTools(user)) return "SELLER";
  return "BUYER";
}

/** Default home path after sign-in. */
export function homePathForUser(user: {
  role: string;
  isBuyer?: boolean | null;
  isSeller?: boolean | null;
  activeMode?: ActiveMode | string | null;
}) {
  if (user.role === "ADMIN") return "/admin";
  if (user.role === "AGENT") return "/agent";
  const mode = resolveActiveMode(user);
  return mode === "SELLER" ? "/owner" : "/account";
}
