/**
 * Houzzat Workspace #1 provisioning helpers (Stage 2B).
 * Data provisioning only — no schema changes, no runtime wiring.
 */
import type {
  PrismaClient,
  WorkspaceMemberRole,
  WorkspaceStatus,
} from "@prisma/client";

/** Stage 2B approved workspace identity. */
export const HOUZZAT_WORKSPACE_SLUG = "houzzat";

/** Legacy operational CRM org — documentation / precondition only (no FK yet). */
export const LEGACY_CRM_ORGANIZATION_SLUG = "demo-agent";

export const EXPECTED_LEAD_COUNT = 41;
export const EXPECTED_WORKSPACE_COUNT_BEFORE = 0;
export const EXPECTED_MEMBER_COUNT_BEFORE = 0;

export type HouzzatStaffIds = {
  billingOwnerUserId: string;
  primaryAgentUserId: string;
  testAdminUserId: string;
};

export type MemberSpec = {
  userId: string;
  role: WorkspaceMemberRole;
  idPrefix: string;
};

export type PreconditionSnapshot = {
  workspaceCount: number;
  workspaceMemberCount: number;
  organizationCount: number;
  membershipCount: number;
  leadCount: number;
  leadNullOrgCount: number;
  leadUnassignedCount: number;
  demoAgentLeadCount: number;
  demoAgentOrgId: string;
  demoAgentOrgSlug: string;
  routingSettingsId: string | null;
  routingListingAgentId: string | null;
  buyerWeightPercent: number | null;
  sellerWeightPercent: number | null;
  staff: HouzzatStaffIds;
};

export type ExistingProvisioningState =
  | { kind: "absent" }
  | { kind: "complete"; workspaceId: string; members: MemberSpec[] }
  | { kind: "drift"; reason: string };

export type PlannedProvisioning = {
  workspace: {
    slug: string;
    name: string;
    status: WorkspaceStatus;
    billingOwnerUserId: string;
    primaryAgentUserId: string;
    brokerageAffiliation: null;
  };
  members: MemberSpec[];
  legacyCrmOrganizationSlug: string;
};

function prefix(id: string): string {
  return id.slice(0, 8);
}

export async function resolveHouzzatStaffIds(
  prisma: PrismaClient,
): Promise<HouzzatStaffIds> {
  const demoAgentOrg = await prisma.organization.findUnique({
    where: { slug: LEGACY_CRM_ORGANIZATION_SLUG },
    select: { id: true },
  });
  if (!demoAgentOrg) {
    throw new Error(
      `Legacy CRM organization slug "${LEGACY_CRM_ORGANIZATION_SLUG}" not found`,
    );
  }

  const houzzatAdminOrg = await prisma.organization.findUnique({
    where: { slug: "houzzat-admin" },
    select: { id: true },
  });
  if (!houzzatAdminOrg) {
    throw new Error('Legacy organization slug "houzzat-admin" not found');
  }

  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", disabledAt: null },
    select: {
      id: true,
      orgMemberships: {
        where: {
          organizationId: { in: [demoAgentOrg.id, houzzatAdminOrg.id] },
          role: "OWNER",
        },
        select: { organizationId: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const billingOwnerCandidates = admins.filter((admin) => {
    const orgIds = new Set(admin.orgMemberships.map((m) => m.organizationId));
    return orgIds.has(demoAgentOrg.id) && orgIds.has(houzzatAdminOrg.id);
  });

  if (billingOwnerCandidates.length !== 1) {
    throw new Error(
      `Expected exactly one billing-owner ADMIN in both legacy orgs; found ${billingOwnerCandidates.length}`,
    );
  }

  const testAdminCandidates = admins.filter(
    (admin) => admin.id !== billingOwnerCandidates[0]!.id,
  );
  if (testAdminCandidates.length !== 1) {
    throw new Error(
      `Expected exactly one secondary ADMIN; found ${testAdminCandidates.length}`,
    );
  }

  const assigneeBuckets = await prisma.lead.groupBy({
    by: ["assignedAgentId"],
    _count: { _all: true },
    where: { assignedAgentId: { not: null } },
  });

  if (assigneeBuckets.length !== 1) {
    throw new Error(
      `Expected exactly one lead assignee bucket; found ${assigneeBuckets.length}`,
    );
  }

  const primaryBucket = assigneeBuckets[0]!;
  if (primaryBucket._count._all !== EXPECTED_LEAD_COUNT) {
    throw new Error(
      `Expected primary assignee to own ${EXPECTED_LEAD_COUNT} leads; found ${primaryBucket._count._all}`,
    );
  }

  const primaryAgentUserId = primaryBucket.assignedAgentId;
  if (!primaryAgentUserId) {
    throw new Error("Primary assignee bucket missing assignedAgentId");
  }

  const primaryAgent = await prisma.user.findUnique({
    where: { id: primaryAgentUserId },
    select: {
      id: true,
      role: true,
      disabledAt: true,
      agentProfile: { select: { active: true } },
    },
  });

  if (
    !primaryAgent ||
    primaryAgent.role !== "AGENT" ||
    primaryAgent.disabledAt ||
    !primaryAgent.agentProfile?.active
  ) {
    throw new Error("Primary agent failed role/profile/disabled checks");
  }

  return {
    billingOwnerUserId: billingOwnerCandidates[0]!.id,
    primaryAgentUserId,
    testAdminUserId: testAdminCandidates[0]!.id,
  };
}

export async function gatherPreconditions(
  prisma: PrismaClient,
): Promise<PreconditionSnapshot> {
  const staff = await resolveHouzzatStaffIds(prisma);

  const [
    workspaceCount,
    workspaceMemberCount,
    organizationCount,
    membershipCount,
    leadCount,
    leadNullOrgCount,
    leadUnassignedCount,
    demoAgentOrg,
    demoAgentLeadCount,
    routingSettings,
    routingWeights,
  ] = await Promise.all([
    prisma.workspace.count(),
    prisma.workspaceMember.count(),
    prisma.organization.count(),
    prisma.organizationMembership.count(),
    prisma.lead.count(),
    prisma.lead.count({ where: { organizationId: null } }),
    prisma.lead.count({ where: { assignedAgentId: null } }),
    prisma.organization.findUnique({
      where: { slug: LEGACY_CRM_ORGANIZATION_SLUG },
      select: { id: true, slug: true },
    }),
    prisma.lead.count({
      where: {
        organization: { slug: LEGACY_CRM_ORGANIZATION_SLUG },
      },
    }),
    prisma.crmRoutingSettings.findUnique({
      where: { id: "default" },
      select: { id: true, listingAgentId: true },
    }),
    prisma.crmRoutingWeight.findMany({
      where: { settingsId: "default" },
      select: { lane: true, agentId: true, percent: true },
    }),
  ]);

  if (!demoAgentOrg) {
    throw new Error(
      `Legacy CRM organization "${LEGACY_CRM_ORGANIZATION_SLUG}" not found`,
    );
  }

  const buyerWeight = routingWeights.find((row) => row.lane === "BUYER");
  const sellerWeight = routingWeights.find((row) => row.lane === "SELLER");

  return {
    workspaceCount,
    workspaceMemberCount,
    organizationCount,
    membershipCount,
    leadCount,
    leadNullOrgCount,
    leadUnassignedCount,
    demoAgentLeadCount,
    demoAgentOrgId: demoAgentOrg.id,
    demoAgentOrgSlug: demoAgentOrg.slug,
    routingSettingsId: routingSettings?.id ?? null,
    routingListingAgentId: routingSettings?.listingAgentId ?? null,
    buyerWeightPercent: buyerWeight?.percent ?? null,
    sellerWeightPercent: sellerWeight?.percent ?? null,
    staff,
  };
}

export function validateFirstProvisionPreconditions(
  snapshot: PreconditionSnapshot,
): string[] {
  const failures: string[] = [];

  if (snapshot.workspaceCount !== EXPECTED_WORKSPACE_COUNT_BEFORE) {
    failures.push(
      `workspaceCount expected ${EXPECTED_WORKSPACE_COUNT_BEFORE} before first provision; got ${snapshot.workspaceCount}`,
    );
  }
  if (snapshot.workspaceMemberCount !== EXPECTED_MEMBER_COUNT_BEFORE) {
    failures.push(
      `workspaceMemberCount expected ${EXPECTED_MEMBER_COUNT_BEFORE} before first provision; got ${snapshot.workspaceMemberCount}`,
    );
  }
  if (snapshot.leadCount !== EXPECTED_LEAD_COUNT) {
    failures.push(
      `leadCount expected ${EXPECTED_LEAD_COUNT}; got ${snapshot.leadCount}`,
    );
  }
  if (snapshot.leadNullOrgCount !== 0) {
    failures.push(`leadNullOrgCount expected 0; got ${snapshot.leadNullOrgCount}`);
  }
  if (snapshot.leadUnassignedCount !== 0) {
    failures.push(
      `leadUnassignedCount expected 0; got ${snapshot.leadUnassignedCount}`,
    );
  }
  if (snapshot.demoAgentLeadCount !== EXPECTED_LEAD_COUNT) {
    failures.push(
      `demo-agent lead count expected ${EXPECTED_LEAD_COUNT}; got ${snapshot.demoAgentLeadCount}`,
    );
  }
  if (snapshot.routingSettingsId !== "default") {
    failures.push(
      `routing settings id expected "default"; got ${snapshot.routingSettingsId}`,
    );
  }
  if (snapshot.routingListingAgentId !== snapshot.staff.primaryAgentUserId) {
    failures.push("routing listingAgentId does not match resolved primary agent");
  }
  if (snapshot.buyerWeightPercent !== 100) {
    failures.push(
      `BUYER routing percent expected 100; got ${snapshot.buyerWeightPercent}`,
    );
  }
  if (snapshot.sellerWeightPercent !== 100) {
    failures.push(
      `SELLER routing percent expected 100; got ${snapshot.sellerWeightPercent}`,
    );
  }

  return failures;
}

export function buildPlannedProvisioning(
  staff: HouzzatStaffIds,
): PlannedProvisioning {
  return {
    workspace: {
      slug: HOUZZAT_WORKSPACE_SLUG,
      name: "Houzzat",
      status: "ACTIVE",
      billingOwnerUserId: staff.billingOwnerUserId,
      primaryAgentUserId: staff.primaryAgentUserId,
      brokerageAffiliation: null,
    },
    members: [
      {
        userId: staff.billingOwnerUserId,
        role: "OWNER",
        idPrefix: prefix(staff.billingOwnerUserId),
      },
      {
        userId: staff.primaryAgentUserId,
        role: "AGENT",
        idPrefix: prefix(staff.primaryAgentUserId),
      },
      {
        userId: staff.testAdminUserId,
        role: "ADMIN",
        idPrefix: prefix(staff.testAdminUserId),
      },
    ],
    legacyCrmOrganizationSlug: LEGACY_CRM_ORGANIZATION_SLUG,
  };
}

export async function loadExistingProvisioning(
  prisma: PrismaClient,
  planned: PlannedProvisioning,
): Promise<ExistingProvisioningState> {
  const workspace = await prisma.workspace.findUnique({
    where: { slug: HOUZZAT_WORKSPACE_SLUG },
    include: {
      members: {
        select: {
          userId: true,
          role: true,
          status: true,
        },
      },
    },
  });

  if (!workspace) {
    const anyWorkspace = await prisma.workspace.count();
    if (anyWorkspace > 0) {
      return {
        kind: "drift",
        reason: `Workspace slug "${HOUZZAT_WORKSPACE_SLUG}" absent but ${anyWorkspace} other workspace row(s) exist`,
      };
    }
    return { kind: "absent" };
  }

  const expectedMembers = new Map(
    planned.members.map((member) => [member.userId, member.role] as const),
  );

  if (workspace.members.length !== planned.members.length) {
    return {
      kind: "drift",
      reason: `Workspace exists with ${workspace.members.length} members; expected ${planned.members.length}`,
    };
  }

  for (const member of workspace.members) {
    const expectedRole = expectedMembers.get(member.userId);
    if (!expectedRole) {
      return {
        kind: "drift",
        reason: `Unexpected workspace member user prefix ${prefix(member.userId)}`,
      };
    }
    if (member.role !== expectedRole) {
      return {
        kind: "drift",
        reason: `Member ${prefix(member.userId)} role ${member.role} != expected ${expectedRole}`,
      };
    }
    if (member.status !== "ACTIVE") {
      return {
        kind: "drift",
        reason: `Member ${prefix(member.userId)} status ${member.status} != ACTIVE`,
      };
    }
  }

  if (workspace.name !== planned.workspace.name) {
    return { kind: "drift", reason: "Workspace name drift" };
  }
  if (workspace.status !== planned.workspace.status) {
    return { kind: "drift", reason: "Workspace status drift" };
  }
  if (workspace.billingOwnerUserId !== planned.workspace.billingOwnerUserId) {
    return { kind: "drift", reason: "Workspace billingOwnerUserId drift" };
  }
  if (workspace.primaryAgentId !== planned.workspace.primaryAgentUserId) {
    return { kind: "drift", reason: "Workspace primaryAgentId drift" };
  }
  if (workspace.brokerageAffiliation !== null) {
    return { kind: "drift", reason: "Workspace brokerageAffiliation must be null" };
  }

  return {
    kind: "complete",
    workspaceId: workspace.id,
    members: planned.members,
  };
}

export async function provisionHouzzatWorkspace(
  prisma: PrismaClient,
  planned: PlannedProvisioning,
): Promise<{ workspaceId: string }> {
  const joinedAt = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        slug: planned.workspace.slug,
        name: planned.workspace.name,
        status: planned.workspace.status,
        billingOwnerUserId: planned.workspace.billingOwnerUserId,
        primaryAgentId: planned.workspace.primaryAgentUserId,
        brokerageAffiliation: null,
      },
      select: { id: true },
    });

    await tx.workspaceMember.createMany({
      data: planned.members.map((member) => ({
        workspaceId: workspace.id,
        userId: member.userId,
        role: member.role,
        status: "ACTIVE" as const,
        invitedById: null,
        joinedAt,
      })),
    });

    const memberCount = await tx.workspaceMember.count({
      where: { workspaceId: workspace.id },
    });
    if (memberCount !== planned.members.length) {
      throw new Error(
        `Workspace member insert incomplete: expected ${planned.members.length}, got ${memberCount}`,
      );
    }

    return workspace;
  });

  return { workspaceId: result.id };
}

export function sanitizeProvisioningReport(input: {
  planned: PlannedProvisioning;
  workspaceId?: string;
  mode: "dry-run" | "apply" | "already-provisioned";
}) {
  return {
    mode: input.mode,
    workspace: {
      idPrefix: input.workspaceId?.slice(0, 8) ?? null,
      slug: input.planned.workspace.slug,
      name: input.planned.workspace.name,
      status: input.planned.workspace.status,
      billingOwnerUserIdPrefix: prefix(input.planned.workspace.billingOwnerUserId),
      primaryAgentUserIdPrefix: prefix(input.planned.workspace.primaryAgentUserId),
      brokerageAffiliation: null,
      memberCount: input.planned.members.length,
    },
    members: input.planned.members.map((member) => ({
      userIdPrefix: member.idPrefix,
      role: member.role,
      status: "ACTIVE",
    })),
    legacyCrmOrganizationSlug: input.planned.legacyCrmOrganizationSlug,
  };
}
