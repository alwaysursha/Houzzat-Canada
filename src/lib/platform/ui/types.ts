/** Stage 6.4 — typed shapes for /api/platform/v1 responses (read-only UI). */

export type PlatformApiSuccess<T> = { ok: true; data: T };
export type PlatformApiFailure = {
  ok: false;
  code: string;
  message: string;
};
export type PlatformApiEnvelope<T> = PlatformApiSuccess<T> | PlatformApiFailure;

export type PlatformMeData = {
  operator: {
    id: string;
    role: string;
    status: string;
  };
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
  capabilities: {
    masterAdminReadOnlyV1: boolean;
    tenantCrmAccess: false;
  };
};

export type PlatformSummaryData = {
  workspaces: { total: number; byStatus: Record<string, number> };
  subscriptions: {
    total: number;
    active: number;
    bySource: Record<string, number>;
    byStatus: Record<string, number>;
    byPlanCode: Record<string, number>;
  };
  prospects: { total: number; byStatus: Record<string, number> };
  seats: {
    totalProvisioned: number;
    totalIncludedSeats: number;
    totalAdditionalSeats: number;
    totalConsumed: number;
  };
  addOnGrants: {
    byStatus: Record<string, number>;
    byCode: Record<string, number>;
  };
  provisioning: { byStatus: Record<string, number> };
};

export type PlatformSeatConsumption = {
  workspaceId: string;
  activeMembers: number;
  suspendedMembers: number;
  pendingUnexpiredInvites: number;
  consumed: number;
};

export type PlatformSubscriptionSummary = {
  id: string;
  workspaceId: string | null;
  offerId: string | null;
  source: string;
  status: string;
  planCode: string | null;
  entitlementProfileCode: string | null;
  billingCadence: string | null;
  currency: string;
  recurringAmountCents: number | null;
  setupFeeCents: number | null;
  includedSeats: number;
  additionalSeats: number;
  hasStripeCustomer: boolean;
  hasStripeSubscription: boolean;
  hasStripePrice: boolean;
  hasStripeCheckoutSession: boolean;
  commercialSnapshotJson: unknown;
  createdAt: string;
  updatedAt: string;
};

export type PlatformWorkspaceListItem = {
  id: string;
  slug: string;
  name: string;
  status: string;
  createdAt: string;
  currentSubscription: PlatformSubscriptionSummary | null;
  entitlementProfileCode: string | null;
  seatQuota: {
    includedSeats: number;
    additionalSeats: number;
    seatLimit: number;
    updatedAt: string;
  } | null;
  seatConsumption: PlatformSeatConsumption;
  branding: { displayName: string; themeId: string | null } | null;
  primaryDomain: {
    hostname: string;
    kind: string;
    role: string;
    status: string;
  } | null;
  billing: {
    source: string;
    email: string;
    hasStripeCustomer: boolean;
  } | null;
  entitlementsEnabledCount: number;
};

export type PlatformListPage<T> = {
  items: T[];
  nextCursor: string | null;
};
