/**
 * Stage 3J.6 — Workspace #2 Lead_B notification canary helpers (dry-run default).
 */
import type { PrismaClient } from "@prisma/client";
import { openLeadHandoffHref } from "../../src/lib/agent/lead-profile-query";
import {
  authorizeStaffRecipientForLead,
  filterStaffRecipientsForLead,
  resolveLeadDeskNotifiers,
} from "../../src/lib/workspace-notification-recipients";
import { isPushTypeEnabled } from "../../src/lib/notifications/catalog";
import { isStaffEmailCategoryEnabled } from "../../src/lib/notifications/staff-categories";
import {
  CANARY_LEAD_MARKER,
  type CanaryBContext,
  type LeadCanaryInput,
  requireLeadEmailForApply,
  requireScopeAckForApply,
  resolveLeadCanaryInputFromEnv,
  resolveTrustedCanaryBContext,
} from "./tenant-lead-canary";
import { type PlanStep, type ReportMode, verifyScopeGates } from "./tenant-canary-provision";

export const CANARY_NOTIFICATION_CONFIRM_TOKEN = "tenant-canary-notification";

export type NotificationCanaryPlan = {
  steps: PlanStep[];
  driftStops: PlanStep[];
  mutationCount: number;
  leadIdPrefix: string | null;
  candidates: string[];
  authorized: string[];
  houzzatInAuthorized: number;
  pushDeviceCounts: Record<string, number>;
  pushPrefs: Record<string, { newLead: boolean }>;
  emailPrefs: Record<string, { newLead: boolean }>;
  href: string | null;
  legacyOrgProof: string[];
  isolationMatrix: string[];
};

function prefix(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.slice(0, 8);
}

export function parseNotificationCanaryCliArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  const confirmArg = argv.find((a) => a.startsWith("--confirm="));
  const confirm = confirmArg?.slice("--confirm=".length) ?? null;
  return { apply, confirm };
}

export function validateNotificationCanaryApplyConfirmation(input: {
  apply: boolean;
  confirm: string | null;
}): string | null {
  if (!input.apply) return null;
  if (input.confirm !== CANARY_NOTIFICATION_CONFIRM_TOKEN) {
    return `--apply requires --confirm=${CANARY_NOTIFICATION_CONFIRM_TOKEN}`;
  }
  return null;
}

async function findCanaryLeadB(
  prisma: PrismaClient,
  context: CanaryBContext,
  leadEmail: string,
) {
  return prisma.lead.findFirst({
    where: {
      workspaceId: context.workspaceId,
      notes: { contains: CANARY_LEAD_MARKER },
      customer: { email: leadEmail.trim().toLowerCase() },
    },
    select: {
      id: true,
      workspaceId: true,
      assignedAgentId: true,
      notes: true,
    },
  });
}

export function enableWorkspaceNotificationSimulation() {
  process.env.WORKSPACE_NOTIFICATION_SCOPE = "workspace";
}

export async function buildNotificationCanaryPlan(
  prisma: PrismaClient,
  input: LeadCanaryInput,
): Promise<NotificationCanaryPlan> {
  enableWorkspaceNotificationSimulation();

  const steps: PlanStep[] = [];
  let drift = false;
  const legacyOrgProof: string[] = [];
  const isolationMatrix: string[] = [];

  const scopeGates = verifyScopeGates();
  if (scopeGates.missingAck) {
    steps.push({
      object: "Scope gates",
      action: "SKIP",
      detail: "CANARY_ACK_PRODUCTION_SCOPES=1 required for --apply",
    });
  } else {
    steps.push({
      object: "Scope gates",
      action: "ALREADY_MATCHES",
      detail: "simulating WORKSPACE_NOTIFICATION_SCOPE=workspace",
    });
  }

  let context: CanaryBContext | null = null;
  try {
    context = await resolveTrustedCanaryBContext(prisma);
  } catch (error) {
    steps.push({
      object: "Workspace B",
      action: "DRIFT_STOP",
      detail: error instanceof Error ? error.message : String(error),
    });
    drift = true;
  }

  let leadIdPrefix: string | null = null;
  let leadId: string | null = null;
  let candidates: string[] = [];
  let authorized: string[] = [];
  let houzzatInAuthorized = 0;
  const pushDeviceCounts: Record<string, number> = {};
  const pushPrefs: Record<string, { newLead: boolean }> = {};
  const emailPrefs: Record<string, { newLead: boolean }> = {};
  let href: string | null = null;

  if (!input.leadEmail) {
    steps.push({
      object: "Lead_B",
      action: "SKIP",
      detail: "CANARY_LEAD_B_EMAIL required",
    });
  } else if (context) {
    const lead = await findCanaryLeadB(prisma, context, input.leadEmail);
    if (!lead) {
      steps.push({
        object: "Lead_B",
        action: "DRIFT_STOP",
        detail: "canary lead not found",
      });
      drift = true;
    } else {
      leadId = lead.id;
      leadIdPrefix = prefix(lead.id);
      href = openLeadHandoffHref(lead.id);
      steps.push({
        object: "Lead_B",
        action: "ALREADY_MATCHES",
        detail: `id=${leadIdPrefix}`,
      });

      const desk = await resolveLeadDeskNotifiers({
        organizationId: context.compatOrgId,
        workspaceId: lead.workspaceId,
      });
      candidates = [
        ...new Set(
          [lead.assignedAgentId, ...desk.map((d) => d.user.id)].filter(
            Boolean,
          ) as string[],
        ),
      ];
      authorized = await filterStaffRecipientsForLead(
        lead.id,
        candidates,
        "new_lead",
      );

      const houzzatMembers = await prisma.workspaceMember.findMany({
        where: { workspaceId: context.houzzatWorkspaceId, status: "ACTIVE" },
        select: { userId: true },
      });
      const houzzatIds = new Set(houzzatMembers.map((m) => m.userId));
      houzzatInAuthorized = authorized.filter((id) => houzzatIds.has(id)).length;

      for (const userId of candidates) {
        const key = prefix(userId)!;
        pushDeviceCounts[key] = await prisma.pushDevice.count({
          where: { userId, shell: "houzzatpro" },
        });
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { pushNotificationPrefs: true },
        });
        pushPrefs[key] = {
          newLead: isPushTypeEnabled(user?.pushNotificationPrefs, "new_lead"),
        };
        emailPrefs[key] = {
          newLead: isStaffEmailCategoryEnabled(
            user?.pushNotificationPrefs,
            "new_lead",
          ),
        };
      }

      if (context.ownerBId) {
        const orgOnly = await prisma.organizationMembership.findFirst({
          where: {
            userId: context.ownerBId,
            organization: { slug: context.compatOrgSlug },
          },
          select: { id: true, role: true, createdAt: true },
        });
        const wsAuth = await authorizeStaffRecipientForLead({
          userId: context.ownerBId,
          leadId: lead.id,
          event: "new_lead",
        });
        legacyOrgProof.push(
          `OWNER_B orgMembership=${orgOnly ? "yes" : "no"} role=${orgOnly?.role ?? "none"}`,
          `OWNER_B authorizeStaffRecipientForLead(Lead_B)=${wsAuth} (workspace member gate)`,
        );
      }

      const houzzatOwner = await prisma.workspaceMember.findFirst({
        where: {
          workspaceId: context.houzzatWorkspaceId,
          role: "OWNER",
          status: "ACTIVE",
        },
        select: { userId: true },
      });
      const houzzatAgent = await prisma.workspaceMember.findFirst({
        where: {
          workspaceId: context.houzzatWorkspaceId,
          role: "AGENT",
          status: "ACTIVE",
        },
        select: { userId: true },
      });
      const houzzatLead = await prisma.lead.findFirst({
        where: { workspaceId: context.houzzatWorkspaceId },
        select: { id: true },
      });

      if (houzzatOwner && houzzatLead) {
        isolationMatrix.push(
          `Lead_B → B AGENT authorized=${authorized.includes(context.agentBId)}`,
          `Lead_B → B OWNER authorized=${context.ownerBId ? authorized.includes(context.ownerBId) : false}`,
          `Lead_B → Houzzat OWNER authorized=${await authorizeStaffRecipientForLead({ userId: houzzatOwner.userId, leadId: lead.id, event: "new_lead" })}`,
          `Lead_B → Houzzat AGENT authorized=${houzzatAgent ? await authorizeStaffRecipientForLead({ userId: houzzatAgent.userId, leadId: lead.id, event: "new_lead" }) : false}`,
          `Houzzat Lead → Houzzat OWNER authorized=${await authorizeStaffRecipientForLead({ userId: houzzatOwner.userId, leadId: houzzatLead.id, event: "new_lead" })}`,
          `Houzzat Lead → B AGENT authorized=${await authorizeStaffRecipientForLead({ userId: context.agentBId, leadId: houzzatLead.id, event: "new_lead" })}`,
          `Platform admin without B seat → Lead_B deny (structural)`,
        );
      }

      steps.push({
        object: "Push",
        action: "SKIP",
        detail: `DRY-RUN — authorized prefixes=[${authorized.map((id) => prefix(id)).join(",")}] devices=${JSON.stringify(pushDeviceCounts)}`,
      });
      steps.push({
        object: "Email",
        action: "SKIP",
        detail: "DRY-RUN — email send disabled until separately approved",
      });
      steps.push({
        object: "Deep link",
        action: "ALREADY_MATCHES",
        detail: href,
      });

      if (houzzatInAuthorized > 0) {
        steps.push({
          object: "Recipient isolation",
          action: "DRIFT_STOP",
          detail: `${houzzatInAuthorized} Houzzat user(s) in authorized set`,
        });
        drift = true;
      } else {
        steps.push({
          object: "Recipient isolation",
          action: "ALREADY_MATCHES",
          detail: "B-only recipients",
        });
      }
    }
  }

  steps.push({
    object: "Notification send",
    action: "SKIP",
    detail: "no push/email in dry-run",
  });

  const driftStops = steps.filter((s) => s.action === "DRIFT_STOP");

  return {
    steps,
    driftStops,
    mutationCount: 0,
    leadIdPrefix,
    candidates: candidates.map((id) => prefix(id)!),
    authorized: authorized.map((id) => prefix(id)!),
    houzzatInAuthorized,
    pushDeviceCounts,
    pushPrefs,
    emailPrefs,
    href,
    legacyOrgProof,
    isolationMatrix,
  };
}

export function formatNotificationCanaryReport(
  plan: NotificationCanaryPlan,
  mode: ReportMode = "dry-run",
): string {
  const lines: string[] = ["NOTIFICATION B CANARY PLAN", ""];
  for (const step of plan.steps) {
    lines.push(`${step.object}: ${step.action}`);
    lines.push(`  ${step.detail}`);
  }
  lines.push("");
  lines.push(`Candidate prefixes: [${plan.candidates.join(",")}]`);
  lines.push(`Authorized prefixes: [${plan.authorized.join(",")}]`);
  lines.push(`Houzzat in authorized: ${plan.houzzatInAuthorized}`);
  if (plan.legacyOrgProof.length > 0) {
    lines.push("");
    lines.push("Legacy org artifact proof:");
    for (const row of plan.legacyOrgProof) {
      lines.push(`  - ${row}`);
    }
  }
  if (plan.isolationMatrix.length > 0) {
    lines.push("");
    lines.push("Isolation matrix:");
    for (const row of plan.isolationMatrix) {
      lines.push(`  - ${row}`);
    }
  }
  lines.push("");
  lines.push(`Mutation count if --apply: ${plan.mutationCount}`);
  if (plan.driftStops.length > 0) {
    lines.push(`DRIFT_STOP count: ${plan.driftStops.length}`);
  }
  lines.push("");
  lines.push(
    mode === "apply-preview"
      ? "APPLY PREVIEW — push may send if devices exist; email still disabled"
      : "DRY RUN — NO PRODUCTION MUTATIONS",
  );
  return lines.join("\n");
}

export {
  resolveLeadCanaryInputFromEnv,
  requireLeadEmailForApply,
  requireScopeAckForApply,
};
