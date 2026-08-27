/**
 * Stage 3K.5.7 — workspace-aware staff notification copy for public leads.
 */
import { SITE_NAME } from "@/lib/constants";
import { resolveRequestTenancy } from "@/lib/tenancy/resolve-request-tenancy";

export type LeadNotificationBrand = {
  displayName: string;
  isHouzzatWorkspace: boolean;
};

export const LEGACY_HOUZZAT_NOTIFICATION_BRAND: LeadNotificationBrand = {
  displayName: SITE_NAME,
  isHouzzatWorkspace: true,
};

export async function resolveLeadNotificationBrandFromRequest(
  request?: Request | null,
): Promise<LeadNotificationBrand> {
  if (!request) return LEGACY_HOUZZAT_NOTIFICATION_BRAND;
  const tenancy = await resolveRequestTenancy(request);
  if (!tenancy.ok) return LEGACY_HOUZZAT_NOTIFICATION_BRAND;
  return {
    displayName: tenancy.brand.displayName,
    isHouzzatWorkspace: tenancy.workspaceSlug === "houzzat",
  };
}

export function resolveLeadNotificationBrandFromDesk(input: {
  workspaceSlug: string | null;
  displayName?: string | null;
}): LeadNotificationBrand {
  const isHouzzatWorkspace = input.workspaceSlug === "houzzat";
  return {
    displayName:
      input.displayName?.trim() ||
      (isHouzzatWorkspace ? SITE_NAME : "Real Estate"),
    isHouzzatWorkspace,
  };
}

export function formatNewLeadEmailSubject(
  brand: LeadNotificationBrand,
  detail: string,
): string {
  if (brand.isHouzzatWorkspace) {
    return `New Houzzat lead: ${detail}`;
  }
  return `New ${brand.displayName} lead: ${detail}`;
}

export function formatNewLeadPushTitle(brand: LeadNotificationBrand): string {
  if (brand.isHouzzatWorkspace) return "New lead";
  return `New ${brand.displayName} lead`;
}

export function formatSignupLeadEmailSubject(
  brand: LeadNotificationBrand,
): string {
  if (brand.isHouzzatWorkspace) return "New signup lead";
  return `New ${brand.displayName} signup`;
}

export function formatSignupLeadDetailLine(
  brand: LeadNotificationBrand,
): string {
  if (brand.isHouzzatWorkspace) {
    return "A new customer signed up on Houzzat.";
  }
  return `A new customer signed up on ${brand.displayName}.`;
}

export function formatLeadSmsPrefix(brand: LeadNotificationBrand): string {
  if (brand.isHouzzatWorkspace) return "Houzzat lead";
  return `${brand.displayName} lead`;
}
