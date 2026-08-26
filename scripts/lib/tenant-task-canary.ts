/**
 * Stage 3J.6 — Workspace #2 Task_B guarded canary helpers.
 */
import type { PrismaClient } from "@prisma/client";
import {
  CALL_NEW_LEAD_TASK_TITLE,
  createCallNewLeadTask,
} from "../../src/lib/agent/lead-intake";
import { agentTaskTenantWhere } from "../../src/lib/crm-read-scope";
import type { CrmScopeContext } from "../../src/lib/crm-read-scope";
import {
  CANARY_LEAD_MARKER,
  type CanaryBContext,
  type LeadCanaryInput,
  requireLeadEmailForApply,
  requireScopeAckForApply,
  resolveLeadCanaryInputFromEnv,
  resolveTrustedCanaryBContext,
} from "./tenant-lead-canary";
import {
  captureHouzzatBaseline,
  type HouzzatBaseline,
  type PlanStep,
  type ReportMode,
  verifyScopeGates,
} from "./tenant-canary-provision";

export const CANARY_TASK_CONFIRM_TOKEN = "tenant-canary-task";

export type TaskCanaryPlan = {
  steps: PlanStep[];
  driftStops: PlanStep[];
  mutationCount: number;
  leadIdPrefix: string | null;
  existingTaskIdPrefix: string | null;
  houzzatBaseline: HouzzatBaseline | null;
  taskIsolation: string[];
};

function prefix(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.slice(0, 8);
}

export function parseTaskCanaryCliArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  const confirmArg = argv.find((a) => a.startsWith("--confirm="));
  const confirm = confirmArg?.slice("--confirm=".length) ?? null;
  return { apply, confirm };
}

export function validateTaskCanaryApplyConfirmation(input: {
  apply: boolean;
  confirm: string | null;
}): string | null {
  if (!input.apply) return null;
  if (input.confirm !== CANARY_TASK_CONFIRM_TOKEN) {
    return `--apply requires --confirm=${CANARY_TASK_CONFIRM_TOKEN}`;
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
      organizationId: true,
      assignedAgentId: true,
      notes: true,
    },
  });
}

function taskCtx(workspaceId: string, userId: string): CrmScopeContext {
  return {
    user: { id: userId },
    organizationId: "org_compat",
    organizationIds: ["org_compat"],
    canSeeTeamLeads: true,
    isPlatformAdmin: false,
    workspaceId,
    isWorkspaceMember: true,
    isWorkspaceCrmAllowed: true,
    hasAmbiguousWorkspaceMembership: false,
  };
}

export async function buildTaskCanaryPlan(
  prisma: PrismaClient,
  input: LeadCanaryInput,
): Promise<TaskCanaryPlan> {
  const steps: PlanStep[] = [];
  let drift = false;
  let context: CanaryBContext | null = null;
  let houzzatBaseline: HouzzatBaseline | null = null;
  let leadIdPrefix: string | null = null;
  let existingTaskIdPrefix: string | null = null;
  const taskIsolation: string[] = [];

  const scopeGates = verifyScopeGates();
  if (scopeGates.failures.length === 0) {
    steps.push({
      object: "Scope gates",
      action: "ALREADY_MATCHES",
      detail: "WORKSPACE_* scopes = workspace (local env)",
    });
  } else if (scopeGates.missingAck) {
    steps.push({
      object: "Scope gates",
      action: "SKIP",
      detail: "CANARY_ACK_PRODUCTION_SCOPES=1 required for --apply",
    });
  } else {
    steps.push({
      object: "Scope gates",
      action: "ALREADY_MATCHES",
      detail: "production scopes acknowledged",
    });
  }

  try {
    houzzatBaseline = await captureHouzzatBaseline(prisma);
    steps.push({
      object: "Houzzat baseline",
      action: "ALREADY_MATCHES",
      detail: `tasks baseline captured (leads=${houzzatBaseline.crm.leadCount})`,
    });
  } catch (error) {
    steps.push({
      object: "Houzzat baseline",
      action: "DRIFT_STOP",
      detail: error instanceof Error ? error.message : String(error),
    });
    drift = true;
  }

  try {
    context = await resolveTrustedCanaryBContext(prisma);
    steps.push({
      object: "Workspace B",
      action: "ALREADY_MATCHES",
      detail: `slug=tenant-canary agent=${context.agentBPrefix}`,
    });
  } catch (error) {
    steps.push({
      object: "Workspace B",
      action: "DRIFT_STOP",
      detail: error instanceof Error ? error.message : String(error),
    });
    drift = true;
  }

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
        detail: "canary lead not found — run lead canary first",
      });
      drift = true;
    } else {
      leadIdPrefix = prefix(lead.id);
      const leadOk =
        lead.workspaceId === context.workspaceId &&
        lead.assignedAgentId === context.agentBId &&
        lead.organizationId === context.compatOrgId &&
        lead.notes?.includes(CANARY_LEAD_MARKER);
      if (!leadOk) {
        steps.push({
          object: "Lead_B",
          action: "DRIFT_STOP",
          detail: "Lead_B ownership mismatch",
        });
        drift = true;
      } else {
        steps.push({
          object: "Lead_B",
          action: "ALREADY_MATCHES",
          detail: `id=${leadIdPrefix} assignee=${context.agentBPrefix}`,
        });

        const openTasks = await prisma.agentTask.findMany({
          where: { leadId: lead.id, status: "OPEN" },
          select: {
            id: true,
            title: true,
            workspaceId: true,
            assigneeId: true,
            organizationId: true,
          },
        });

        const callNew = openTasks.filter(
          (t) => t.title === CALL_NEW_LEAD_TASK_TITLE,
        );
        const unexpected = openTasks.filter(
          (t) => t.title !== CALL_NEW_LEAD_TASK_TITLE,
        );

        if (unexpected.length > 0) {
          steps.push({
            object: "Task_B",
            action: "DRIFT_STOP",
            detail: `${unexpected.length} unexpected OPEN task(s) on Lead_B`,
          });
          drift = true;
        } else if (callNew.length === 0) {
          steps.push({
            object: "Task_B",
            action: "CREATE",
            detail: `createCallNewLeadTask lead=${leadIdPrefix} workspaceId=B`,
          });
          steps.push({
            object: "Child ownership",
            action: "CREATE",
            detail:
              "resolveChildCrmOwnership reads Lead_B.workspaceId — not organizationId",
          });
        } else if (callNew.length === 1) {
          const task = callNew[0]!;
          existingTaskIdPrefix = prefix(task.id);
          const ok =
            task.workspaceId === context.workspaceId &&
            task.assigneeId === context.agentBId &&
            task.organizationId === context.compatOrgId &&
            task.title === CALL_NEW_LEAD_TASK_TITLE;
          if (ok) {
            steps.push({
              object: "Task_B",
              action: "ALREADY_MATCHES",
              detail: `id=${existingTaskIdPrefix} title="${CALL_NEW_LEAD_TASK_TITLE}"`,
            });
          } else {
            steps.push({
              object: "Task_B",
              action: "DRIFT_STOP",
              detail: "Call new lead task exists with unexpected ownership",
            });
            drift = true;
          }
        } else {
          steps.push({
            object: "Task_B",
            action: "DRIFT_STOP",
            detail: `${callNew.length} duplicate Call new lead tasks`,
          });
          drift = true;
        }

        const houzzat = context.houzzatWorkspaceId;
        const bAgentTasks = await prisma.agentTask.count({
          where: agentTaskTenantWhere(taskCtx(context.workspaceId, context.agentBId)),
        });
        const bOwnerTasks = context.ownerBId
          ? await prisma.agentTask.count({
              where: agentTaskTenantWhere(
                taskCtx(context.workspaceId, context.ownerBId),
              ),
            })
          : 0;
        const hAgentSeesB = await prisma.agentTask.count({
          where: {
            AND: [
              agentTaskTenantWhere(taskCtx(houzzat, context.agentBId)),
              { leadId: lead.id },
            ],
          },
        });
        const hOwner = await prisma.workspaceMember.findFirst({
          where: { workspaceId: houzzat, role: "OWNER", status: "ACTIVE" },
          select: { userId: true },
        });
        const hOwnerSeesB = hOwner
          ? await prisma.agentTask.count({
              where: {
                AND: [
                  agentTaskTenantWhere(taskCtx(houzzat, hOwner.userId)),
                  { leadId: lead.id },
                ],
              },
            })
          : 0;

        taskIsolation.push(
          `B AGENT task count in B context: ${bAgentTasks}`,
          `B OWNER task count in B context: ${bOwnerTasks}`,
          `Houzzat AGENT sees Lead_B tasks: ${hAgentSeesB} (expected 0)`,
          `Houzzat OWNER sees Lead_B tasks: ${hOwnerSeesB} (expected 0)`,
        );
      }
    }
  }

  steps.push({
    object: "Houzzat routing",
    action: "SKIP",
    detail: "unchanged — task create does not touch routing",
  });

  const driftStops = steps.filter((s) => s.action === "DRIFT_STOP");
  const mutationCount = steps.filter((s) => s.action === "CREATE").length;

  return {
    steps,
    driftStops,
    mutationCount,
    leadIdPrefix,
    existingTaskIdPrefix,
    houzzatBaseline,
    taskIsolation,
  };
}

export function formatTaskCanaryReport(
  plan: TaskCanaryPlan,
  mode: ReportMode = "dry-run",
): string {
  const lines: string[] = ["TASK B CANARY PLAN", ""];
  for (const step of plan.steps) {
    lines.push(`${step.object}: ${step.action}`);
    lines.push(`  ${step.detail}`);
  }
  if (plan.taskIsolation.length > 0) {
    lines.push("");
    lines.push("Task isolation plan:");
    for (const row of plan.taskIsolation) {
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
      ? "APPLY PREVIEW — Task_B mutation executes next if gates pass"
      : "DRY RUN — NO PRODUCTION MUTATIONS",
  );
  return lines.join("\n");
}

export async function executeTaskCanaryApply(
  prisma: PrismaClient,
  input: LeadCanaryInput,
  context: CanaryBContext,
  baselineBefore: HouzzatBaseline,
  deps: {
    createCallNewLeadTask?: typeof createCallNewLeadTask;
    captureHouzzatBaseline?: typeof captureHouzzatBaseline;
  } = {},
): Promise<PlanStep[]> {
  const createTask = deps.createCallNewLeadTask ?? createCallNewLeadTask;
  const captureBaseline = deps.captureHouzzatBaseline ?? captureHouzzatBaseline;
  const applied: PlanStep[] = [];
  const lead = await findCanaryLeadB(prisma, context, input.leadEmail!);
  if (!lead) throw new Error("DRIFT_STOP: Lead_B not found");

  const existing = await prisma.agentTask.findFirst({
    where: {
      leadId: lead.id,
      status: "OPEN",
      title: CALL_NEW_LEAD_TASK_TITLE,
    },
  });
  if (existing) {
    applied.push({
      object: "Task_B",
      action: "ALREADY_MATCHES",
      detail: existing.id,
    });
    return applied;
  }

  const task = await createTask({
    leadId: lead.id,
    assigneeId: context.agentBId,
    organizationId: context.compatOrgId,
    createdById: context.agentBId,
  });

  if (task.workspaceId !== context.workspaceId) {
    throw new Error("DRIFT_STOP: Task_B workspaceId != B after create");
  }
  if (task.assigneeId !== context.agentBId) {
    throw new Error("DRIFT_STOP: Task_B assignee mismatch after create");
  }

  applied.push({ object: "Task_B", action: "CREATE", detail: task.id });

  const baselineAfter = await captureBaseline(prisma);
  if (baselineAfter.crm.leadCount !== baselineBefore.crm.leadCount) {
    throw new Error("DRIFT_STOP: Houzzat lead count changed during task apply");
  }

  return applied;
}

export async function buildTaskCanaryRollbackPlan(
  prisma: PrismaClient,
  input: LeadCanaryInput,
): Promise<{
  steps: PlanStep[];
  driftStops: PlanStep[];
  mutationCount: number;
  taskId: string | null;
}> {
  const steps: PlanStep[] = [];
  if (!input.leadEmail) {
    steps.push({
      object: "Task_B",
      action: "SKIP",
      detail: "CANARY_LEAD_B_EMAIL required",
    });
    return { steps, driftStops: [], mutationCount: 0, taskId: null };
  }

  let context: CanaryBContext;
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
      taskId: null,
    };
  }

  const lead = await findCanaryLeadB(prisma, context, input.leadEmail);
  if (!lead) {
    steps.push({
      object: "Task_B",
      action: "SKIP",
      detail: "Lead_B not found",
    });
    return { steps, driftStops: [], mutationCount: 0, taskId: null };
  }

  const task = await prisma.agentTask.findFirst({
    where: {
      leadId: lead.id,
      title: CALL_NEW_LEAD_TASK_TITLE,
      workspaceId: context.workspaceId,
      assigneeId: context.agentBId,
    },
    select: { id: true, status: true },
  });

  if (!task) {
    steps.push({
      object: "Task_B",
      action: "SKIP",
      detail: "no canary Call new lead task found",
    });
    return { steps, driftStops: [], mutationCount: 0, taskId: null };
  }

  steps.push({
    object: "Task_B",
    action: "DELETE",
    detail: `id=${prefix(task.id)} lead=${prefix(lead.id)} workspaceId=B`,
  });

  const driftStops = steps.filter((s) => s.action === "DRIFT_STOP");
  return {
    steps,
    driftStops,
    mutationCount: steps.filter((s) => s.action === "DELETE").length,
    taskId: task.id,
  };
}

export function formatTaskCanaryRollbackReport(
  plan: {
    steps: PlanStep[];
    driftStops: PlanStep[];
    mutationCount: number;
  },
  mode: ReportMode = "dry-run",
): string {
  const lines: string[] = ["TASK B ROLLBACK PLAN", ""];
  for (const step of plan.steps) {
    lines.push(`${step.object}: ${step.action}`);
    lines.push(`  ${step.detail}`);
  }
  lines.push("");
  lines.push("Houzzat protected: no Houzzat tasks touched");
  lines.push("");
  lines.push(`Mutation count if --apply: ${plan.mutationCount}`);
  lines.push("");
  lines.push(
    mode === "apply-preview"
      ? "APPLY PREVIEW — task deletion executes next if gates pass"
      : "DRY RUN — NO PRODUCTION MUTATIONS",
  );
  return lines.join("\n");
}

export async function executeTaskCanaryRollbackApply(
  prisma: PrismaClient,
  input: LeadCanaryInput,
): Promise<PlanStep[]> {
  const plan = await buildTaskCanaryRollbackPlan(prisma, input);
  if (plan.driftStops.length > 0 || !plan.taskId) {
    throw new Error("DRIFT_STOP or nothing to rollback");
  }
  await prisma.agentTask.delete({ where: { id: plan.taskId } });
  return [{ object: "Task_B", action: "DELETE", detail: plan.taskId }];
}

export {
  resolveLeadCanaryInputFromEnv,
  resolveTrustedCanaryBContext,
  requireLeadEmailForApply,
  requireScopeAckForApply,
};
