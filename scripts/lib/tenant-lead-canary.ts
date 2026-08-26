/**
 * Stage 3J.4 — Workspace #2 Lead_B guarded canary helpers.
 * Data paths only — callers enforce dry-run / --confirm gates.
 */
import type { PrismaClient } from "@prisma/client";
import {
  HOUZZAT_WORKSPACE_SLUG,
  LEGACY_CRM_ORGANIZATION_SLUG,
} from "../../src/lib/crm-ownership";
import {
  CANARY_AFFILIATION,
  CANARY_NAME,
  CANARY_ROUTING_SETTINGS_ID,
  CANARY_SLUG,
  captureHouzzatBaseline,
  type HouzzatBaseline,
  type PlanStep,
  type ReportMode,
  verifyScopeGates,
} from "./tenant-canary-provision";

export const CANARY_LEAD_MARKER = "[CANARY][TENANT-B]";
export const CANARY_LEAD_CONFIRM_TOKEN = "tenant-canary-lead";
export const CANARY_LEAD_NAME = "Tenant B Lead Canary";

export type LeadCanaryInput = {
  leadEmail: string | null;
  leadName: string;
};

export type CanaryBContext = {
  workspaceId: string;
  workspaceSlug: string;
  houzzatWorkspaceId: string;
  compatOrgId: string;
  compatOrgSlug: string;
  agentBId: string;
  agentBPrefix: string;
  ownerBId: string | null;
  ownerBPrefix: string | null;
  primaryAgentId: string;
  routingSettingsId: string;
  buyerTotal: number;
  sellerTotal: number;
};

export type NotificationPlan = {
  assigneePrefix: string | null;
  deskPrefixes: string[];
  authorizedPrefixes: string[];
  houzzatRecipientCount: number;
  pushDeviceCountForAgentB: number;
};

export type LeadCanaryPlan = {
  steps: PlanStep[];
  driftStops: PlanStep[];
  mutationCount: number;
  input: LeadCanaryInput;
  context: CanaryBContext | null;
  routedAssigneePrefix: string | null;
  houzzatBaseline: HouzzatBaseline | null;
  bLeadCount: number;
  existingLeadIdPrefix: string | null;
  notificationPlan: NotificationPlan | null;
  readIsolation: string[];
};

function prefix(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.slice(0, 8);
}

function emailHint(email: string): string {
  const at = email.indexOf("@");
  if (at <= 1) return "…";
  return `${email.slice(0, 2)}…${email.slice(at)}`;
}

export function parseLeadCanaryCliArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  const confirmArg = argv.find((a) => a.startsWith("--confirm="));
  const confirm = confirmArg?.slice("--confirm=".length) ?? null;
  return { apply, confirm };
}

export function validateLeadCanaryApplyConfirmation(input: {
  apply: boolean;
  confirm: string | null;
}): string | null {
  if (!input.apply) return null;
  if (!input.confirm) {
    return `--apply requires --confirm=${CANARY_LEAD_CONFIRM_TOKEN}`;
  }
  if (input.confirm !== CANARY_LEAD_CONFIRM_TOKEN) {
    return `--apply requires --confirm=${CANARY_LEAD_CONFIRM_TOKEN}`;
  }
  return null;
}

export function resolveLeadCanaryInputFromEnv(): LeadCanaryInput {
  return {
    leadEmail: process.env.CANARY_LEAD_B_EMAIL?.trim().toLowerCase() || null,
    leadName: process.env.CANARY_LEAD_B_NAME?.trim() || CANARY_LEAD_NAME,
  };
}

export function requireLeadEmailForApply(input: LeadCanaryInput): string | null {
  if (!input.leadEmail) {
    return "CANARY_LEAD_B_EMAIL is required for --apply (controlled synthetic email)";
  }
  return null;
}

export function requireScopeAckForApply(): string | null {
  if (process.env.CANARY_ACK_PRODUCTION_SCOPES?.trim() !== "1") {
    return "CANARY_ACK_PRODUCTION_SCOPES=1 is required for --apply";
  }
  return null;
}

export async function resolveTrustedCanaryBContext(
  prisma: PrismaClient,
  agentEmail?: string | null,
): Promise<CanaryBContext> {
  const [workspace, houzzat, compatOrg] = await Promise.all([
    prisma.workspace.findUnique({
      where: { slug: CANARY_SLUG },
      select: {
        id: true,
        slug: true,
        status: true,
        name: true,
        brokerageAffiliation: true,
        primaryAgentId: true,
      },
    }),
    prisma.workspace.findUnique({
      where: { slug: HOUZZAT_WORKSPACE_SLUG },
      select: { id: true },
    }),
    prisma.organization.findUnique({
      where: { slug: LEGACY_CRM_ORGANIZATION_SLUG },
      select: { id: true, slug: true },
    }),
  ]);

  if (!houzzat) {
    throw new Error(`Houzzat workspace slug "${HOUZZAT_WORKSPACE_SLUG}" not found`);
  }
  if (!workspace) {
    throw new Error(`Workspace B slug "${CANARY_SLUG}" not found`);
  }
  if (workspace.id === houzzat.id) {
    throw new Error("DRIFT_STOP: tenant-canary workspace id equals Houzzat id");
  }
  if (workspace.status !== "ACTIVE") {
    throw new Error(`Workspace B status=${workspace.status} (expected ACTIVE)`);
  }
  if (workspace.name !== CANARY_NAME) {
    throw new Error("DRIFT_STOP: Workspace B name mismatch");
  }
  if (workspace.brokerageAffiliation !== CANARY_AFFILIATION) {
    throw new Error("DRIFT_STOP: Workspace B brokerageAffiliation mismatch");
  }
  if (!compatOrg) {
    throw new Error(
      `Compatibility org "${LEGACY_CRM_ORGANIZATION_SLUG}" not found`,
    );
  }
  if (!workspace.primaryAgentId) {
    throw new Error("DRIFT_STOP: Workspace B primaryAgentId missing");
  }

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: workspace.id, status: "ACTIVE" },
    select: {
      role: true,
      userId: true,
      user: { select: { email: true, role: true, agentProfile: { select: { active: true } } } },
    },
  });

  if (members.length !== 2) {
    throw new Error(
      `DRIFT_STOP: Workspace B ACTIVE member count=${members.length} (expected 2)`,
    );
  }

  const owner = members.find((m) => m.role === "OWNER");
  const agent = members.find((m) => m.role === "AGENT");
  if (!owner || !agent) {
    throw new Error("DRIFT_STOP: Workspace B missing OWNER or AGENT member");
  }

  if (agentEmail) {
    const normalized = agentEmail.trim().toLowerCase();
    if (agent.user.email?.toLowerCase() !== normalized) {
      throw new Error("DRIFT_STOP: AGENT_B email does not match CANARY_AGENT_B_EMAIL");
    }
  }

  if (!agent.user.agentProfile?.active) {
    throw new Error("DRIFT_STOP: AGENT_B AgentProfile missing or inactive");
  }
  if (workspace.primaryAgentId !== agent.userId) {
    throw new Error("DRIFT_STOP: primaryAgentId does not equal AGENT_B");
  }

  const routing = await prisma.crmRoutingSettings.findUnique({
    where: { id: CANARY_ROUTING_SETTINGS_ID },
    include: { weights: true },
  });
  if (!routing || routing.workspaceId !== workspace.id) {
    throw new Error("DRIFT_STOP: tenant-canary-routing missing or foreign workspace");
  }
  if (routing.listingAgentId !== agent.userId) {
    throw new Error("DRIFT_STOP: routing listingAgentId != AGENT_B");
  }
  if (routing.sellerAssignMode !== "LISTING_AGENT") {
    throw new Error("DRIFT_STOP: routing sellerAssignMode != LISTING_AGENT");
  }

  const buyer = routing.weights.filter((w) => w.lane === "BUYER");
  const seller = routing.weights.filter((w) => w.lane === "SELLER");
  const buyerTotal = buyer.reduce((sum, w) => sum + w.percent, 0);
  const sellerTotal = seller.reduce((sum, w) => sum + w.percent, 0);
  if (buyerTotal !== 100 || sellerTotal !== 100) {
    throw new Error(
      `DRIFT_STOP: routing totals BUYER=${buyerTotal} SELLER=${sellerTotal}`,
    );
  }
  if (
    buyer.length !== 1 ||
    seller.length !== 1 ||
    buyer[0]?.agentId !== agent.userId ||
    seller[0]?.agentId !== agent.userId
  ) {
    throw new Error("DRIFT_STOP: routing weights do not assign 100% to AGENT_B");
  }

  const houzzatPollution = await prisma.crmRoutingWeight.count({
    where: {
      settingsId: "default",
      agentId: { in: [agent.userId, owner.userId] },
    },
  });
  if (houzzatPollution > 0) {
    throw new Error("DRIFT_STOP: B agents present in Houzzat default routing");
  }

  return {
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    houzzatWorkspaceId: houzzat.id,
    compatOrgId: compatOrg.id,
    compatOrgSlug: compatOrg.slug,
    agentBId: agent.userId,
    agentBPrefix: prefix(agent.userId)!,
    ownerBId: owner.userId,
    ownerBPrefix: prefix(owner.userId),
    primaryAgentId: workspace.primaryAgentId,
    routingSettingsId: routing.id,
    buyerTotal,
    sellerTotal,
  };
}

async function findExistingCanaryLead(
  prisma: PrismaClient,
  workspaceId: string,
  leadEmail: string | null,
) {
  if (!leadEmail) return null;
  return prisma.lead.findFirst({
    where: {
      workspaceId,
      notes: { contains: CANARY_LEAD_MARKER },
      customer: { email: leadEmail.trim().toLowerCase() },
    },
    select: {
      id: true,
      workspaceId: true,
      assignedAgentId: true,
      organizationId: true,
      notes: true,
      status: true,
      intent: true,
      source: true,
    },
  });
}

export async function planNotificationRecipients(
  prisma: PrismaClient,
  context: CanaryBContext,
  houzzatWorkspaceId: string,
): Promise<NotificationPlan> {
  const { resolveWorkspaceDeskRecipients } = await import(
    "../../src/lib/workspace-notification-recipients"
  );

  const desk = await resolveWorkspaceDeskRecipients(context.workspaceId);
  const deskIds = desk.map((d) => d.id);
  const candidateIds = [...new Set([context.agentBId, ...deskIds])];

  const houzzatMembers = await prisma.workspaceMember.findMany({
    where: { workspaceId: houzzatWorkspaceId, status: "ACTIVE" },
    select: { userId: true },
  });
  const houzzatMemberIds = new Set(houzzatMembers.map((m) => m.userId));
  const houzzatRecipientCount = candidateIds.filter((id) =>
    houzzatMemberIds.has(id),
  ).length;

  const pushDeviceCountForAgentB = await prisma.pushDevice.count({
    where: { userId: context.agentBId, shell: "houzzatpro" },
  });

  return {
    assigneePrefix: prefix(context.agentBId),
    deskPrefixes: deskIds.map((id) => prefix(id)!),
    authorizedPrefixes: candidateIds
      .filter((id) => !houzzatMemberIds.has(id) || id === context.agentBId)
      .map((id) => prefix(id)!),
    houzzatRecipientCount,
    pushDeviceCountForAgentB,
  };
}

export function buildReadIsolationPlan(context: CanaryBContext | null): string[] {
  if (!context) {
    return ["unavailable until Workspace B context resolves"];
  }
  return [
    `B OWNER (${context.ownerBPrefix}) + Lead_B → allow (workspaceId match)`,
    `B AGENT (${context.agentBPrefix}) + Lead_B → allow`,
    `Houzzat member + Lead_B → deny (workspaceId != Houzzat)`,
    `B member + Houzzat lead → deny (workspaceId != B)`,
    `same-brokerage orgId demo-agent does NOT widen READ scope`,
    `deep-link /agent/open-lead/{Lead_B}: B member → allow; Houzzat member → 404`,
    `B stats after create: total=1; Houzzat stats: unchanged baseline (natural growth caveat)`,
  ];
}

export async function buildLeadCanaryPlan(
  prisma: PrismaClient,
  input: LeadCanaryInput,
): Promise<LeadCanaryPlan> {
  const steps: PlanStep[] = [];
  let drift = false;
  let context: CanaryBContext | null = null;
  let houzzatBaseline: HouzzatBaseline | null = null;
  let routedAssigneePrefix: string | null = null;
  let bLeadCount = 0;
  let existingLeadIdPrefix: string | null = null;
  let notificationPlan: NotificationPlan | null = null;

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
      detail: `${scopeGates.failures.join("; ")} — CANARY_ACK_PRODUCTION_SCOPES=1 required for --apply`,
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
      detail: `leads=${houzzatBaseline.crm.leadCount} members=${houzzatBaseline.memberCount}`,
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
      detail: `id=${prefix(context.workspaceId)} slug=${context.workspaceSlug}`,
    });
    steps.push({
      object: "Routing B",
      action: "ALREADY_MATCHES",
      detail: `${context.routingSettingsId} BUYER=${context.buyerTotal} SELLER=${context.sellerTotal}`,
    });
    steps.push({
      object: "AGENT_B",
      action: "ALREADY_MATCHES",
      detail: `id=${context.agentBPrefix} active AgentProfile primaryAgent`,
    });
  } catch (error) {
    steps.push({
      object: "Workspace B",
      action: "DRIFT_STOP",
      detail: error instanceof Error ? error.message : String(error),
    });
    drift = true;
  }

  if (context) {
    bLeadCount = await prisma.lead.count({
      where: { workspaceId: context.workspaceId },
    });

    if (bLeadCount > 0 && !input.leadEmail) {
      steps.push({
        object: "Lead B pre-check",
        action: "DRIFT_STOP",
        detail: `B already has ${bLeadCount} lead(s) — provide CANARY_LEAD_B_EMAIL to classify`,
      });
      drift = true;
    } else if (bLeadCount > 1) {
      steps.push({
        object: "Lead B pre-check",
        action: "DRIFT_STOP",
        detail: `B lead count=${bLeadCount} (expected 0 or 1 canary)`,
      });
      drift = true;
    } else if (bLeadCount === 1 && !input.leadEmail) {
      steps.push({
        object: "Lead B pre-check",
        action: "DRIFT_STOP",
        detail: "B has 1 lead — CANARY_LEAD_B_EMAIL required to verify canary identity",
      });
      drift = true;
    } else if (bLeadCount === 0) {
      steps.push({
        object: "Lead B pre-check",
        action: "ALREADY_MATCHES",
        detail: "B lead count=0",
      });
    }

    const { resolveWorkspaceRoutedAssignee } = await import(
      "../../src/lib/workspace-routing"
    );
    const routedId = await resolveWorkspaceRoutedAssignee(
      context.workspaceId,
      "BUYER",
    );
    routedAssigneePrefix = prefix(routedId);
    if (!routedId || routedId !== context.agentBId) {
      steps.push({
        object: "Routing resolution",
        action: "DRIFT_STOP",
        detail: `resolveWorkspaceRoutedAssignee(B,BUYER)=${routedAssigneePrefix ?? "null"} expected ${context.agentBPrefix}`,
      });
      drift = true;
    } else {
      steps.push({
        object: "Routing resolution",
        action: "ALREADY_MATCHES",
        detail: `resolveWorkspaceRoutedAssignee(B,BUYER)=${context.agentBPrefix}`,
      });
    }

    if (input.leadEmail) {
      const existing = await findExistingCanaryLead(
        prisma,
        context.workspaceId,
        input.leadEmail,
      );
      if (!existing) {
        steps.push({
          object: "Lead B",
          action: "CREATE",
          detail: `workspaceId=B assignee=${context.agentBPrefix} marker=${CANARY_LEAD_MARKER}`,
        });
        steps.push({
          object: "LeadActivity",
          action: "CREATE",
          detail: "type=created minimal canary activity",
        });
      } else {
        existingLeadIdPrefix = prefix(existing.id);
        const ok =
          existing.workspaceId === context.workspaceId &&
          existing.assignedAgentId === context.agentBId &&
          existing.organizationId === context.compatOrgId &&
          existing.notes?.includes(CANARY_LEAD_MARKER) &&
          existing.status === "NEW_LEAD" &&
          existing.intent === "BUYER" &&
          existing.source === "OTHER";
        if (ok) {
          steps.push({
            object: "Lead B",
            action: "ALREADY_MATCHES",
            detail: `id=${existingLeadIdPrefix} marker+ownership verified`,
          });
        } else {
          steps.push({
            object: "Lead B",
            action: "DRIFT_STOP",
            detail: "canary marker exists with unexpected ownership",
          });
          drift = true;
        }
      }
    } else {
      steps.push({
        object: "Lead B",
        action: "SKIP",
        detail: "set CANARY_LEAD_B_EMAIL for lead plan",
      });
    }

    steps.push({
      object: "Compat organization",
      action: "ALREADY_MATCHES",
      detail: `${context.compatOrgSlug} (metadata only — workspaceId=B is authority)`,
    });
    steps.push({
      object: "Organization B",
      action: "SKIP",
      detail: "not created",
    });

    steps.push({
      object: "Task",
      action: "SKIP",
      detail:
        "createCallNewLeadTask deferred — would inherit workspaceId from lead via resolveChildCrmOwnership when enabled later",
    });
    steps.push({
      object: "Push",
      action: "SKIP",
      detail: "DRY-RUN recipient plan only — no send",
    });
    steps.push({
      object: "Email",
      action: "SKIP",
      detail: "DRY-RUN recipient plan only — no send",
    });

    notificationPlan = await planNotificationRecipients(
      prisma,
      context,
      context.houzzatWorkspaceId,
    );
  } else if (!input.leadEmail) {
    steps.push({
      object: "Lead B",
      action: "SKIP",
      detail: "set CANARY_LEAD_B_EMAIL",
    });
  }

  const driftStops = steps.filter((s) => s.action === "DRIFT_STOP");
  const mutationCount = steps.filter((s) => s.action === "CREATE").length;

  return {
    steps,
    driftStops,
    mutationCount,
    input,
    context,
    routedAssigneePrefix,
    houzzatBaseline,
    bLeadCount,
    existingLeadIdPrefix,
    notificationPlan,
    readIsolation: buildReadIsolationPlan(context),
  };
}

export function formatLeadCanaryReport(
  plan: LeadCanaryPlan,
  mode: ReportMode = "dry-run",
): string {
  const lines: string[] = ["LEAD B CANARY PLAN", ""];
  for (const step of plan.steps) {
    lines.push(`${step.object}: ${step.action}`);
    lines.push(`  ${step.detail}`);
  }

  if (plan.context) {
    lines.push("");
    lines.push(`Expected assignee: AGENT_B (${plan.context.agentBPrefix})`);
    lines.push(`Expected workspace: B (${prefix(plan.context.workspaceId)})`);
    lines.push(`Expected compat org: ${plan.context.compatOrgSlug} (metadata only)`);
  }

  if (plan.notificationPlan) {
    lines.push("");
    lines.push("Expected recipients (structural dry-run):");
    lines.push(
      `  assignee=${plan.notificationPlan.assigneePrefix} desk=[${plan.notificationPlan.deskPrefixes.join(",")}]`,
    );
    lines.push(
      `  B-only authorized prefixes=[${plan.notificationPlan.authorizedPrefixes.join(",")}]`,
    );
    lines.push(
      `  Houzzat recipients in candidate set: ${plan.notificationPlan.houzzatRecipientCount}`,
    );
    lines.push(
      `  AGENT_B HouzzatPro PushDevice count: ${plan.notificationPlan.pushDeviceCountForAgentB}`,
    );
  }

  if (plan.readIsolation.length > 0) {
    lines.push("");
    lines.push("Read isolation plan:");
    for (const row of plan.readIsolation) {
      lines.push(`  - ${row}`);
    }
  }

  if (plan.houzzatBaseline) {
    lines.push("");
    lines.push("Houzzat baseline: UNCHANGED EXPECTED");
    lines.push(
      `  ws=${prefix(plan.houzzatBaseline.workspaceId)} leads=${plan.houzzatBaseline.crm.leadCount} members=${plan.houzzatBaseline.memberCount}`,
    );
  }

  lines.push("");
  lines.push(`Mutation count if --apply: ${plan.mutationCount}`);
  if (plan.driftStops.length > 0) {
    lines.push(`DRIFT_STOP count: ${plan.driftStops.length}`);
  }
  if (!plan.input.leadEmail) {
    lines.push("");
    lines.push("USER INPUT REQUIRED: set CANARY_LEAD_B_EMAIL before --apply");
  }

  lines.push("");
  lines.push(
    mode === "apply-preview"
      ? "APPLY PREVIEW — mutations execute next if gates pass (no push/email/task by default)"
      : "DRY RUN — NO PRODUCTION MUTATIONS",
  );
  return lines.join("\n");
}

export async function executeLeadCanaryApply(
  prisma: PrismaClient,
  input: LeadCanaryInput,
  context: CanaryBContext,
  baselineBefore: HouzzatBaseline,
): Promise<PlanStep[]> {
  const applied: PlanStep[] = [];

  const existing = input.leadEmail
    ? await findExistingCanaryLead(prisma, context.workspaceId, input.leadEmail)
    : null;
  if (existing) {
    applied.push({
      object: "Lead B",
      action: "ALREADY_MATCHES",
      detail: existing.id,
    });
    return applied;
  }

  const { resolveWorkspaceRoutedAssignee } = await import(
    "../../src/lib/workspace-routing"
  );
  const routedId = await resolveWorkspaceRoutedAssignee(
    context.workspaceId,
    "BUYER",
  );
  if (!routedId || routedId !== context.agentBId) {
    throw new Error("DRIFT_STOP: routing resolution mismatch at apply time");
  }

  const email = input.leadEmail!.trim().toLowerCase();
  const name = input.leadName.trim();
  const notes = `${CANARY_LEAD_MARKER} synthetic tenant-canary lead`;

  let customer = await prisma.user.findUnique({ where: { email } });
  if (!customer) {
    customer = await prisma.user.create({
      data: {
        email,
        name,
        role: "BUYER",
        isBuyer: true,
        isSeller: false,
        caslConsentAt: new Date(),
      },
    });
    applied.push({
      object: "Lead customer",
      action: "CREATE",
      detail: prefix(customer.id)!,
    });
  }

  const lead = await prisma.lead.create({
    data: {
      status: "NEW_LEAD",
      source: "OTHER",
      intent: "BUYER",
      score: 10,
      notes,
      customerId: customer.id,
      assignedAgentId: context.agentBId,
      organizationId: context.compatOrgId,
      workspaceId: context.workspaceId,
      contactConsentAt: new Date(),
      statusChangedAt: new Date(),
    },
  });
  applied.push({ object: "Lead B", action: "CREATE", detail: lead.id });

  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      type: "created",
      userId: context.agentBId,
      body: `${CANARY_LEAD_MARKER} Lead B created by guarded canary script`,
    },
  });
  applied.push({
    object: "LeadActivity",
    action: "CREATE",
    detail: `lead=${prefix(lead.id)}`,
  });

  const baselineAfter = await captureHouzzatBaseline(prisma);
  if (
    baselineAfter.memberCount !== baselineBefore.memberCount ||
    baselineAfter.crm.leadCount !== baselineBefore.crm.leadCount ||
    baselineAfter.routing.listingAgentIdPrefix !==
      baselineBefore.routing.listingAgentIdPrefix
  ) {
    throw new Error("DRIFT_STOP: Houzzat baseline changed during Lead B apply");
  }

  return applied;
}

export async function buildLeadCanaryRollbackPlan(
  prisma: PrismaClient,
  input: LeadCanaryInput,
): Promise<{
  steps: PlanStep[];
  driftStops: PlanStep[];
  mutationCount: number;
  leadId: string | null;
}> {
  const steps: PlanStep[] = [];
  let context: CanaryBContext | null = null;

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
      leadId: null,
    };
  }

  if (!input.leadEmail) {
    steps.push({
      object: "Lead B",
      action: "SKIP",
      detail: "CANARY_LEAD_B_EMAIL required to identify exact canary lead",
    });
    return { steps, driftStops: [], mutationCount: 0, leadId: null };
  }

  const lead = await findExistingCanaryLead(
    prisma,
    context.workspaceId,
    input.leadEmail,
  );
  if (!lead) {
    steps.push({
      object: "Lead B",
      action: "SKIP",
      detail: "no canary lead found — nothing to rollback",
    });
    return { steps, driftStops: [], mutationCount: 0, leadId: null };
  }

  if (lead.workspaceId !== context.workspaceId) {
    steps.push({
      object: "Lead B",
      action: "DRIFT_STOP",
      detail: "lead workspaceId != B",
    });
  } else if (lead.assignedAgentId !== context.agentBId) {
    steps.push({
      object: "Lead B",
      action: "DRIFT_STOP",
      detail: "lead assignee != AGENT_B",
    });
  } else if (!lead.notes?.includes(CANARY_LEAD_MARKER)) {
    steps.push({
      object: "Lead B",
      action: "DRIFT_STOP",
      detail: "lead missing canary marker",
    });
  } else {
    const [tasks, notes, emails, activities] = await Promise.all([
      prisma.agentTask.count({ where: { leadId: lead.id } }),
      prisma.leadNote.count({ where: { leadId: lead.id } }),
      prisma.leadEmailLog.count({ where: { leadId: lead.id } }),
      prisma.leadActivity.count({ where: { leadId: lead.id } }),
    ]);
    steps.push({
      object: "LeadActivity",
      action: "DELETE",
      detail: `${activities} row(s) leadId=${prefix(lead.id)}`,
    });
    if (tasks > 0) {
      steps.push({
        object: "AgentTask",
        action: "DELETE",
        detail: `${tasks} row(s)`,
      });
    }
    if (notes > 0) {
      steps.push({
        object: "LeadNote",
        action: "DELETE",
        detail: `${notes} row(s)`,
      });
    }
    if (emails > 0) {
      steps.push({
        object: "LeadEmailLog",
        action: "DELETE",
        detail: `${emails} row(s)`,
      });
    }
    steps.push({
      object: "Lead B",
      action: "DELETE",
      detail: `id=${prefix(lead.id)} workspaceId=B marker verified`,
    });
  }

  const driftStops = steps.filter((s) => s.action === "DRIFT_STOP");
  const mutationCount = steps.filter((s) => s.action === "DELETE").length;
  return {
    steps,
    driftStops,
    mutationCount,
    leadId: driftStops.length === 0 ? lead.id : null,
  };
}

export function formatLeadCanaryRollbackReport(
  plan: {
    steps: PlanStep[];
    driftStops: PlanStep[];
    mutationCount: number;
  },
  mode: ReportMode = "dry-run",
): string {
  const lines: string[] = ["LEAD B ROLLBACK PLAN", ""];
  for (const step of plan.steps) {
    lines.push(`${step.object}: ${step.action}`);
    lines.push(`  ${step.detail}`);
  }
  lines.push("");
  lines.push("Houzzat protected: no Houzzat leads touched");
  lines.push("");
  lines.push(`Mutation count if --apply: ${plan.mutationCount}`);
  if (plan.driftStops.length > 0) {
    lines.push(`DRIFT_STOP count: ${plan.driftStops.length}`);
  }
  lines.push("");
  lines.push(
    mode === "apply-preview"
      ? "APPLY PREVIEW — deletions execute next if gates pass"
      : "DRY RUN — NO PRODUCTION MUTATIONS",
  );
  return lines.join("\n");
}

export async function executeLeadCanaryRollbackApply(
  prisma: PrismaClient,
  input: LeadCanaryInput,
): Promise<PlanStep[]> {
  const plan = await buildLeadCanaryRollbackPlan(prisma, input);
  if (plan.driftStops.length > 0) {
    throw new Error(
      `DRIFT_STOP: ${plan.driftStops.map((s) => s.detail).join("; ")}`,
    );
  }
  if (!plan.leadId) return [];

  const leadId = plan.leadId;
  const context = await resolveTrustedCanaryBContext(prisma);
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { workspaceId: true, notes: true, assignedAgentId: true },
  });
  if (
    !lead ||
    lead.workspaceId !== context.workspaceId ||
    lead.assignedAgentId !== context.agentBId ||
    !lead.notes?.includes(CANARY_LEAD_MARKER)
  ) {
    throw new Error("DRIFT_STOP: lead identity guard failed at rollback apply");
  }

  const applied: PlanStep[] = [];
  await prisma.leadActivity.deleteMany({ where: { leadId } });
  await prisma.agentTask.deleteMany({ where: { leadId } });
  await prisma.leadNote.deleteMany({ where: { leadId } });
  await prisma.leadEmailLog.deleteMany({ where: { leadId } });
  await prisma.lead.delete({ where: { id: leadId } });
  applied.push({ object: "Lead B", action: "DELETE", detail: leadId });
  return applied;
}
