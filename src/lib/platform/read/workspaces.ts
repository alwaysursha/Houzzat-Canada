import type { Prisma, WorkspaceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildCursorPage,
  type PlatformListParams,
} from "@/lib/platform/api/pagination";
import { getWorkspaceSeatConsumption } from "@/lib/platform/seats";
import {
  serializeBillingCustomerSummary,
  serializeBranding,
  serializeDomains,
  serializeSubscriptionSummary,
  serializeSeatQuota,
  serializeEntitlements,
  serializeAddOnGrants,
  serializeEmailIdentity,
  serializeStatusEvents,
  sanitizeProvisioningError,
} from "@/lib/platform/read/serialize";

function primaryDomainSummary(
  domains: Array<{
    hostname: string;
    kind: string;
    role: string;
    status: string;
  }>,
) {
  const platform = domains.find((d) => d.kind === "PLATFORM");
  const customPrimary = domains.find(
    (d) => d.kind === "CUSTOM" && d.role === "PRIMARY",
  );
  const canonical = customPrimary ?? platform ?? domains[0] ?? null;
  return canonical
    ? {
        hostname: canonical.hostname,
        kind: canonical.kind,
        role: canonical.role,
        status: canonical.status,
      }
    : null;
}

async function buildWorkspaceControlPlaneRow(workspace: {
  id: string;
  slug: string;
  name: string;
  status: WorkspaceStatus;
  createdAt: Date;
  currentSubscription: Parameters<typeof serializeSubscriptionSummary>[0];
  branding: Parameters<typeof serializeBranding>[0];
  seatQuota: Parameters<typeof serializeSeatQuota>[0];
  entitlements: Array<{ enabled: boolean }>;
  billingCustomer: Parameters<typeof serializeBillingCustomerSummary>[0];
  domains: Array<{
    hostname: string;
    kind: string;
    role: string;
    status: string;
  }>;
}) {
  const seatConsumption = await getWorkspaceSeatConsumption(workspace.id);
  return {
    id: workspace.id,
    slug: workspace.slug,
    name: workspace.name,
    status: workspace.status,
    createdAt: workspace.createdAt.toISOString(),
    currentSubscription: serializeSubscriptionSummary(workspace.currentSubscription),
    entitlementProfileCode:
      workspace.currentSubscription?.entitlementProfileCode ?? null,
    seatQuota: serializeSeatQuota(workspace.seatQuota),
    seatConsumption,
    branding: workspace.branding
      ? {
          displayName: workspace.branding.displayName,
          themeId: workspace.branding.themeId,
        }
      : null,
    primaryDomain: primaryDomainSummary(workspace.domains),
    billing: workspace.billingCustomer
      ? {
          source: workspace.billingCustomer.source,
          email: workspace.billingCustomer.email,
          hasStripeCustomer: Boolean(workspace.billingCustomer.stripeCustomerId),
        }
      : null,
    entitlementsEnabledCount: workspace.entitlements.filter((e) => e.enabled)
      .length,
  };
}

const workspaceListSelect = {
  id: true,
  slug: true,
  name: true,
  status: true,
  createdAt: true,
  currentSubscription: true,
  branding: true,
  seatQuota: true,
  entitlements: true,
  billingCustomer: true,
  domains: {
    select: {
      id: true,
      hostname: true,
      kind: true,
      role: true,
      status: true,
      verifiedAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.WorkspaceSelect;

export async function listPlatformWorkspaces(params: PlatformListParams) {
  const where: Prisma.WorkspaceWhereInput = {};
  if (params.status) {
    where.status = params.status as WorkspaceStatus;
  }

  const rows = await prisma.workspace.findMany({
    where,
    select: workspaceListSelect,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: params.limit + 1,
    ...(params.cursor
      ? {
          cursor: { id: params.cursor },
          skip: 1,
        }
      : {}),
  });

  const page = buildCursorPage(rows, params.limit);
  const items = await Promise.all(
    page.items.map((workspace) => buildWorkspaceControlPlaneRow(workspace)),
  );

  return { items, nextCursor: page.nextCursor };
}

export async function getPlatformWorkspaceDetail(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      ...workspaceListSelect,
      subscriptions: {
        orderBy: { createdAt: "desc" },
      },
      addOnGrants: {
        orderBy: { createdAt: "desc" },
      },
      emailIdentity: true,
      statusEvents: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      provisioningRuns: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          offerId: true,
          subscriptionId: true,
          attemptCount: true,
          lastError: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!workspace) return null;

  const seatConsumption = await getWorkspaceSeatConsumption(workspace.id);

  return {
    ...(await buildWorkspaceControlPlaneRow(workspace)),
    subscriptionHistory: workspace.subscriptions.map(serializeSubscriptionSummary),
    billingCustomer: serializeBillingCustomerSummary(workspace.billingCustomer),
    entitlements: serializeEntitlements(workspace.entitlements),
    addOnGrants: serializeAddOnGrants(workspace.addOnGrants),
    emailIdentity: serializeEmailIdentity(workspace.emailIdentity),
    statusEvents: serializeStatusEvents(workspace.statusEvents),
    domains: serializeDomains(workspace.domains),
    provisioningRuns: workspace.provisioningRuns.map((run) => ({
      id: run.id,
      status: run.status,
      offerId: run.offerId,
      subscriptionId: run.subscriptionId,
      attemptCount: run.attemptCount,
      lastError: sanitizeProvisioningError(run.lastError),
      startedAt: run.startedAt?.toISOString() ?? null,
      completedAt: run.completedAt?.toISOString() ?? null,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    })),
    seatConsumption,
    brandingDetail: serializeBranding(workspace.branding),
  };
}

export async function getPlatformWorkspaceBySlug(slug: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!workspace) return null;
  return getPlatformWorkspaceDetail(workspace.id);
}
