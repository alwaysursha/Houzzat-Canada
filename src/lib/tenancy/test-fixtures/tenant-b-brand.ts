/**
 * Stage 3K.2 — Tenant B branding test fixture (selftests only — NOT production).
 */
import type { WorkspaceBranding } from "@prisma/client";

export const TENANT_B_TEST_WORKSPACE_ID = "tenant_b_test_workspace_id";
export const TENANT_B_TEST_DISPLAY_NAME = "Tenant Canary";

/** Deliberately non-Houzzat blue for isolation proofs. */
export const TENANT_B_TEST_PRIMARY_COLOR = "#2563EB";

import { platformHostnameForWorkspaceSlug } from "../platform-hostname";

const tenantBPlatform = platformHostnameForWorkspaceSlug("tenant-canary");
if (!tenantBPlatform.ok) {
  throw new Error(`tenant-canary platform hostname: ${tenantBPlatform.error}`);
}

/** Stage 3K.4.2 — canonical platform hostname for tenant-canary fixture. */
export const TENANT_B_PLATFORM_HOSTNAME = tenantBPlatform.hostname;

/** Interim legacy hostname — production until Stage 3K.5 migration. */
export const TENANT_B_LEGACY_INTERIM_HOSTNAME = "canary.houzzat.com";

export const TENANT_B_CANARY_PRIMARY_HOSTNAME = TENANT_B_PLATFORM_HOSTNAME;

export const TENANT_B_TEST_BRANDING_ROW: WorkspaceBranding = {
  workspaceId: TENANT_B_TEST_WORKSPACE_ID,
  tier: "GENERIC",
  displayName: TENANT_B_TEST_DISPLAY_NAME,
  tagline: "Canary workspace branding fixture",
  logoUrl: null,
  brokerageLogoUrl: null,
  faviconUrl: null,
  agentProfilePhotoUrl: null,
  primaryColor: TENANT_B_TEST_PRIMARY_COLOR,
  secondaryColor: "#1E40AF",
  accentColor: "#0EA5E9",
  themeId: null,
  contactEmail: null,
  contactPhone: null,
  footerLegalText: null,
  poweredByHouzzatPro: true,
  seoDescription: "Canary workspace branding fixture",
  ogImageUrl: null,
  version: 1,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};
