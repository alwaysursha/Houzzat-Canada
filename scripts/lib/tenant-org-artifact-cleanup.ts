/**
 * Stage 3J.8 — Guarded cleanup for OWNER_B demo-agent OrganizationMembership artifact.
 * Dry-run default. Does NOT auto-run from syncBrokerageSeats.
 */
import type { PrismaClient } from "@prisma/client";
import { LEGACY_CRM_ORGANIZATION_SLUG, HOUZZAT_WORKSPACE_SLUG } from "../../src/lib/crm-ownership";
import {
  CANARY_SLUG,
  type PlanStep,
  type ReportMode,
  verifyScopeGates,
} from "./tenant-canary-provision";
import {
  requireScopeAckForApply,
  resolveTrustedCanaryBContext,
} from "./tenant-lead-canary";

export const CANARY_ORG_ARTIFACT_CONFIRM_TOKEN = "tenant-canary-org-artifact";

export type OrgArtifactCleanupPlan = {
  steps: PlanStep[];
  driftStops: PlanStep[];
  mutationCount: number;
  membershipIdPrefix: string | null;
};

function prefix(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.slice(0, 8);
}

export function parseOrgArtifactCleanupCliArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  const confirmArg = argv.find((a) => a.startsWith("--confirm="));
  const confirm = confirmArg?.slice("--confirm=".length) ?? null;
  return { apply, confirm };
}

export function validateOrgArtifactCleanupApplyConfirmation(input: {
  apply: boolean;
  confirm: string | null;
}): string | null {
  if (!input.apply) return null;
  if (input.confirm !== CANARY_ORG_ARTIFACT_CONFIRM_TOKEN) {
    return `--apply requires --confirm=${CANARY_ORG_ARTIFACT_CONFIRM_TOKEN}`;
  }
  return null;
}

export { requireScopeAckForApply };

export async function buildOrgArtifactCleanupPlan(
  prisma: PrismaClient,
): Promise<OrgArtifactCleanupPlan> {
  const steps: PlanStep[] = [];
  let membershipIdPrefix: string | null = null;

  const scopeGates = verifyScopeGates();
  if (scopeGates.missingAck) {
    steps.push({
      object: "Scope gates",
      action: "SKIP",
      detail: "CANARY_ACK_PRODUCTION_SCOPES=1 required for --apply",
    });
  }

  let context;
  try {
    context = await resolveTrustedCanaryBContext(prisma);
  } catch (error) {
    steps.push({
      object: "Workspace B",
      action: "DRIFT_STOP",
      detail: error instanceof Error ? error.message : String(error),
    });
    return {
      steps,
      driftStops: steps.filter((s) => s.action === "DRIFT_STOP"),
      mutationCount: 0,
      membershipIdPrefix: null,
    };
  }

  if (!context.ownerBId) {
    steps.push({
      object: "OWNER_B",
      action: "DRIFT_STOP",
      detail: "OWNER_B not resolved",
    });
    return {
      steps,
      driftStops: steps.filter((s) => s.action === "DRIFT_STOP"),
      mutationCount: 0,
      membershipIdPrefix: null,
    };
  }

  const houzzatMember = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: context.houzzatWorkspaceId,
      userId: context.ownerBId,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (houzzatMember) {
    steps.push({
      object: "OWNER_B",
      action: "DRIFT_STOP",
      detail: "OWNER_B has ACTIVE Houzzat membership — cleanup refused",
    });
    return {
      steps,
      driftStops: steps.filter((s) => s.action === "DRIFT_STOP"),
      mutationCount: 0,
      membershipIdPrefix: null,
    };
  }

  const bMember = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: context.workspaceId,
      userId: context.ownerBId,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (!bMember) {
    steps.push({
      object: "OWNER_B",
      action: "DRIFT_STOP",
      detail: "OWNER_B missing ACTIVE tenant-canary membership",
    });
    return {
      steps,
      driftStops: steps.filter((s) => s.action === "DRIFT_STOP"),
      mutationCount: 0,
      membershipIdPrefix: null,
    };
  }

  const org = await prisma.organization.findUnique({
    where: { slug: LEGACY_CRM_ORGANIZATION_SLUG },
    select: { id: true },
  });
  if (!org) {
    steps.push({
      object: "demo-agent",
      action: "DRIFT_STOP",
      detail: "compatibility org missing",
    });
    return {
      steps,
      driftStops: steps.filter((s) => s.action === "DRIFT_STOP"),
      mutationCount: 0,
      membershipIdPrefix: null,
    };
  }

  const membership = await prisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: org.id,
        userId: context.ownerBId,
      },
    },
    select: { id: true, role: true },
  });

  if (!membership) {
    steps.push({
      object: "OrganizationMembership",
      action: "ALREADY_MATCHES",
      detail: "no OWNER_B demo-agent row",
    });
  } else {
    membershipIdPrefix = prefix(membership.id);
    steps.push({
      object: "OrganizationMembership",
      action: "DELETE",
      detail: `id=${membershipIdPrefix} role=${membership.role} user=${prefix(context.ownerBId)} org=${LEGACY_CRM_ORGANIZATION_SLUG}`,
    });
  }

  steps.push({
    object: "Houzzat",
    action: "PRESERVE",
    detail: `slug=${HOUZZAT_WORKSPACE_SLUG} — no membership rows touched`,
  });
  steps.push({
    object: "Workspace B",
    action: "PRESERVE",
    detail: `slug=${CANARY_SLUG} — WorkspaceMember preserved`,
  });
  steps.push({
    object: "Auto-sync",
    action: "SKIP",
    detail: "syncBrokerageSeats never deletes foreign org rows",
  });

  const driftStops = steps.filter((s) => s.action === "DRIFT_STOP");
  return {
    steps,
    driftStops,
    mutationCount: steps.filter((s) => s.action === "DELETE").length,
    membershipIdPrefix,
  };
}

export function formatOrgArtifactCleanupReport(
  plan: OrgArtifactCleanupPlan,
  mode: ReportMode = "dry-run",
): string {
  const lines: string[] = ["CANARY ORG ARTIFACT CLEANUP PLAN", ""];
  for (const step of plan.steps) {
    lines.push(`${step.object}: ${step.action}`);
    lines.push(`  ${step.detail}`);
  }
  lines.push("");
  lines.push(`Mutation count if --apply: ${plan.mutationCount}`);
  lines.push("");
  lines.push(
    mode === "apply-preview"
      ? "APPLY PREVIEW — deletion executes next if gates pass"
      : "DRY RUN — NO PRODUCTION MUTATIONS",
  );
  return lines.join("\n");
}

export async function executeOrgArtifactCleanupApply(
  prisma: PrismaClient,
): Promise<PlanStep[]> {
  const plan = await buildOrgArtifactCleanupPlan(prisma);
  if (plan.driftStops.length > 0 || plan.mutationCount === 0) {
    throw new Error("DRIFT_STOP or nothing to delete");
  }
  const context = await resolveTrustedCanaryBContext(prisma);
  const org = await prisma.organization.findUnique({
    where: { slug: LEGACY_CRM_ORGANIZATION_SLUG },
    select: { id: true },
  });
  if (!org || !context.ownerBId) {
    throw new Error("DRIFT_STOP: missing org or OWNER_B");
  }
  const row = await prisma.organizationMembership.findUnique({
    where: {
      organizationId_userId: {
        organizationId: org.id,
        userId: context.ownerBId,
      },
    },
  });
  if (!row) return [{ object: "OrganizationMembership", action: "ALREADY_MATCHES", detail: "gone" }];

  await prisma.organizationMembership.delete({ where: { id: row.id } });
  return [{ object: "OrganizationMembership", action: "DELETE", detail: row.id }];
}
