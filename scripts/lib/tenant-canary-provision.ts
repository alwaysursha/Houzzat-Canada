/**
 * Stage 3J.2 — Workspace #2 (tenant-canary) guarded provision + rollback helpers.
 * Data paths only — callers enforce dry-run / --confirm gates.
 */
import type {
  PrismaClient,
  WorkspaceMemberRole,
  WorkspaceMemberStatus,
} from "@prisma/client";
import { CRM_ROUTING_SETTINGS_ID } from "../../src/lib/agent/routing-types";
import { HOUZZAT_WORKSPACE_SLUG } from "../../src/lib/crm-ownership";

export const CANARY_SLUG = "tenant-canary";
export const CANARY_NAME = "Houzzat Tenant Canary";
export const CANARY_AFFILIATION = "Sun Realty (CANARY)";
export const CANARY_ROUTING_SETTINGS_ID = "tenant-canary-routing";
export const CANARY_CONFIRM_TOKEN = "tenant-canary";

export const HOUZZAT_ROUTING_ID = CRM_ROUTING_SETTINGS_ID;

export type PlanAction =
  | "CREATE"
  | "ALREADY_MATCHES"
  | "DRIFT_STOP"
  | "DELETE"
  | "SKIP"
  | "PRESERVE";

export type PlanStep = {
  object: string;
  action: PlanAction;
  detail: string;
};

export type ScopeGateResult = {
  ok: boolean;
  local: Record<string, string>;
  missingAck: boolean;
  failures: string[];
};

export type HouzzatBaseline = {
  workspaceId: string;
  status: string;
  memberCount: number;
  primaryAgentIdPrefix: string | null;
  routing: {
    settingsId: string;
    workspaceIdPrefix: string | null;
    listingAgentIdPrefix: string | null;
    sellerAssignMode: string;
    buyerWeights: Array<{ agentIdPrefix: string; percent: number }>;
    sellerWeights: Array<{ agentIdPrefix: string; percent: number }>;
  };
  crm: {
    leadCount: number;
    nullWorkspaceLeads: number;
    wrongWorkspaceLeads: number;
  };
};

export type CanaryIdentityInput = {
  ownerEmail: string | null;
  ownerName: string;
  agentEmail: string | null;
  agentName: string;
};

export type ProvisionPlan = {
  steps: PlanStep[];
  driftStops: PlanStep[];
  mutationCount: number;
  identity: CanaryIdentityInput;
  houzzatBaseline: HouzzatBaseline | null;
  scopeGates: ScopeGateResult;
};

export type RollbackPlan = {
  steps: PlanStep[];
  driftStops: PlanStep[];
  mutationCount: number;
  canaryWorkspaceId: string | null;
  houzzatProtected: string[];
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

export function parseCanaryCliArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  const confirmArg = argv.find((a) => a.startsWith("--confirm="));
  const confirm = confirmArg?.slice("--confirm=".length) ?? null;
  return { apply, confirm };
}

export function validateApplyConfirmation(input: {
  apply: boolean;
  confirm: string | null;
}): string | null {
  if (!input.apply) return null;
  if (input.confirm !== CANARY_CONFIRM_TOKEN) {
    return `--apply requires --confirm=${CANARY_CONFIRM_TOKEN}`;
  }
  return null;
}

export function resolveCanaryIdentityFromEnv(): CanaryIdentityInput {
  return {
    ownerEmail: process.env.CANARY_OWNER_B_EMAIL?.trim().toLowerCase() || null,
    ownerName: process.env.CANARY_OWNER_B_NAME?.trim() || "Canary Owner B",
    agentEmail: process.env.CANARY_AGENT_B_EMAIL?.trim().toLowerCase() || null,
    agentName: process.env.CANARY_AGENT_B_NAME?.trim() || "Canary Agent B",
  };
}

export function requireCanaryEmailsForApply(
  identity: CanaryIdentityInput,
): string | null {
  if (!identity.ownerEmail) {
    return "CANARY_OWNER_B_EMAIL is required for --apply (controlled synthetic email)";
  }
  if (!identity.agentEmail) {
    return "CANARY_AGENT_B_EMAIL is required for --apply (controlled synthetic email)";
  }
  if (identity.ownerEmail === identity.agentEmail) {
    return "OWNER_B and AGENT_B must use distinct emails";
  }
  return null;
}

const SCOPE_KEYS = [
  "WORKSPACE_READ_SCOPE",
  "WORKSPACE_ROUTING_SCOPE",
  "WORKSPACE_NOTIFICATION_SCOPE",
  "WORKSPACE_TEAM_SCOPE",
] as const;

export function verifyScopeGates(): ScopeGateResult {
  const local: Record<string, string> = {};
  const failures: string[] = [];
  for (const key of SCOPE_KEYS) {
    const value = (process.env[key] ?? "legacy").trim().toLowerCase();
    local[key] = value || "(unset)";
    if (value !== "workspace") {
      failures.push(`${key}=${value} (expected workspace)`);
    }
  }
  const dual = (process.env.WORKSPACE_DUAL_WRITE ?? "1").trim().toLowerCase();
  local.WORKSPACE_DUAL_WRITE = dual;
  if (dual === "0" || dual === "false" || dual === "off") {
    failures.push("WORKSPACE_DUAL_WRITE is disabled");
  }

  const ack =
    process.env.CANARY_ACK_PRODUCTION_SCOPES?.trim() === "1" ||
    failures.length === 0;
  const missingAck = failures.length > 0 && !ack;

  return {
    ok: failures.length === 0 || ack,
    local,
    missingAck,
    failures,
  };
}

export async function captureHouzzatBaseline(
  prisma: PrismaClient,
): Promise<HouzzatBaseline> {
  const houzzat = await prisma.workspace.findUnique({
    where: { slug: HOUZZAT_WORKSPACE_SLUG },
    select: {
      id: true,
      status: true,
      primaryAgentId: true,
      _count: { select: { members: { where: { status: "ACTIVE" } } } },
    },
  });
  if (!houzzat) {
    throw new Error(`Houzzat workspace slug "${HOUZZAT_WORKSPACE_SLUG}" not found`);
  }

  const settings = await prisma.crmRoutingSettings.findUnique({
    where: { id: HOUZZAT_ROUTING_ID },
    include: {
      weights: { select: { agentId: true, lane: true, percent: true } },
    },
  });
  if (!settings) {
    throw new Error(`Houzzat routing settings id="${HOUZZAT_ROUTING_ID}" not found`);
  }

  const [leadCount, nullWorkspaceLeads] = await Promise.all([
    prisma.lead.count({ where: { workspaceId: houzzat.id } }),
    prisma.lead.count({ where: { workspaceId: null } }),
  ]);

  const wrongWorkspaceLeads = await prisma.lead.count({
    where: {
      workspaceId: { not: null, notIn: [houzzat.id] },
    },
  });

  return {
    workspaceId: houzzat.id,
    status: houzzat.status,
    memberCount: houzzat._count.members,
    primaryAgentIdPrefix: prefix(houzzat.primaryAgentId),
    routing: {
      settingsId: settings.id,
      workspaceIdPrefix: prefix(settings.workspaceId),
      listingAgentIdPrefix: prefix(settings.listingAgentId),
      sellerAssignMode: settings.sellerAssignMode,
      buyerWeights: settings.weights
        .filter((w) => w.lane === "BUYER")
        .map((w) => ({
          agentIdPrefix: prefix(w.agentId)!,
          percent: w.percent,
        })),
      sellerWeights: settings.weights
        .filter((w) => w.lane === "SELLER")
        .map((w) => ({
          agentIdPrefix: prefix(w.agentId)!,
          percent: w.percent,
        })),
    },
    crm: { leadCount, nullWorkspaceLeads, wrongWorkspaceLeads },
  };
}

function assertProtectedHouzzatIds(houzzatId: string, targetWorkspaceId?: string) {
  if (targetWorkspaceId && targetWorkspaceId === houzzatId) {
    throw new Error("DRIFT_STOP: target workspace id equals Houzzat id");
  }
}

async function userHasHouzzatMembership(
  prisma: PrismaClient,
  userId: string,
  houzzatId: string,
): Promise<boolean> {
  const row = await prisma.workspaceMember.findFirst({
    where: { workspaceId: houzzatId, userId, status: "ACTIVE" },
    select: { id: true },
  });
  return Boolean(row);
}

async function classifyUser(
  prisma: PrismaClient,
  input: {
    label: string;
    email: string | null;
    expectedRole: "ADMIN" | "AGENT";
    houzzatId: string;
    requireAgentProfile: boolean;
  },
): Promise<{ steps: PlanStep[]; userId: string | null; drift: boolean }> {
  const steps: PlanStep[] = [];
  if (!input.email) {
    steps.push({
      object: input.label,
      action: "SKIP",
      detail: "email not provided — set CANARY_*_EMAIL for apply",
    });
    return { steps, userId: null, drift: false };
  }

  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      role: true,
      disabledAt: true,
      agentProfile: { select: { active: true } },
      workspaceMemberships: {
        select: {
          workspaceId: true,
          status: true,
          workspace: { select: { slug: true } },
        },
      },
    },
  });

  if (!user) {
    steps.push({
      object: input.label,
      action: "CREATE",
      detail: `flat User create (${input.expectedRole}, email ${emailHint(input.email)}) — no password; invite/activation required`,
    });
    if (input.requireAgentProfile) {
      steps.push({
        object: `${input.label} AgentProfile`,
        action: "CREATE",
        detail: "flat AgentProfile create active=true",
      });
    }
    return { steps, userId: null, drift: false };
  }

  if (user.disabledAt) {
    steps.push({
      object: input.label,
      action: "DRIFT_STOP",
      detail: `existing user disabled (${emailHint(input.email)})`,
    });
    return { steps, userId: user.id, drift: true };
  }

  if (user.role !== input.expectedRole) {
    steps.push({
      object: input.label,
      action: "DRIFT_STOP",
      detail: `existing user role=${user.role}, expected ${input.expectedRole}`,
    });
    return { steps, userId: user.id, drift: true };
  }

  if (await userHasHouzzatMembership(prisma, user.id, input.houzzatId)) {
    steps.push({
      object: input.label,
      action: "DRIFT_STOP",
      detail: "user is ACTIVE Houzzat WorkspaceMember",
    });
    return { steps, userId: user.id, drift: true };
  }

  const foreignMemberships = user.workspaceMemberships.filter(
    (m) =>
      m.status === "ACTIVE" &&
      m.workspace.slug !== CANARY_SLUG &&
      m.workspace.slug !== HOUZZAT_WORKSPACE_SLUG,
  );
  if (foreignMemberships.length > 0) {
    steps.push({
      object: input.label,
      action: "DRIFT_STOP",
      detail: `user has unexpected ACTIVE workspace memberships (${foreignMemberships.length})`,
    });
    return { steps, userId: user.id, drift: true };
  }

  if (input.requireAgentProfile) {
    if (!user.agentProfile) {
      steps.push({
        object: `${input.label} AgentProfile`,
        action: "CREATE",
        detail: "flat AgentProfile create active=true",
      });
    } else if (!user.agentProfile.active) {
      steps.push({
        object: `${input.label} AgentProfile`,
        action: "CREATE",
        detail: "set AgentProfile.active=true",
      });
    } else {
      steps.push({
        object: `${input.label} AgentProfile`,
        action: "ALREADY_MATCHES",
        detail: "active AgentProfile",
      });
    }
  }

  steps.push({
    object: input.label,
    action: "ALREADY_MATCHES",
    detail: `user ${prefix(user.id)} (${emailHint(input.email)})`,
  });
  return { steps, userId: user.id, drift: false };
}

export async function buildProvisionPlan(
  prisma: PrismaClient,
  identity: CanaryIdentityInput,
): Promise<ProvisionPlan> {
  const steps: PlanStep[] = [];
  let drift = false;
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
      detail: `${scopeGates.failures.join("; ")} — set CANARY_ACK_PRODUCTION_SCOPES=1 before --apply if production verified`,
    });
  } else {
    steps.push({
      object: "Scope gates",
      action: "ALREADY_MATCHES",
      detail: "production scopes acknowledged via CANARY_ACK_PRODUCTION_SCOPES=1",
    });
  }

  let houzzatBaseline: HouzzatBaseline | null = null;
  try {
    houzzatBaseline = await captureHouzzatBaseline(prisma);
    steps.push({
      object: "Houzzat baseline",
      action: "ALREADY_MATCHES",
      detail: `captured ws=${prefix(houzzatBaseline.workspaceId)} members=${houzzatBaseline.memberCount} leads=${houzzatBaseline.crm.leadCount}`,
    });
  } catch (error) {
    steps.push({
      object: "Houzzat baseline",
      action: "DRIFT_STOP",
      detail: error instanceof Error ? error.message : String(error),
    });
    drift = true;
  }

  const houzzatId = houzzatBaseline?.workspaceId;

  const existingCanary = await prisma.workspace.findUnique({
    where: { slug: CANARY_SLUG },
    select: {
      id: true,
      name: true,
      status: true,
      brokerageAffiliation: true,
      primaryAgentId: true,
    },
  });

  if (houzzatId) {
    assertProtectedHouzzatIds(houzzatId, existingCanary?.id);
  }

  if (!existingCanary) {
    steps.push({
      object: "Workspace B",
      action: "CREATE",
      detail: `slug=${CANARY_SLUG} name="${CANARY_NAME}" status=ACTIVE`,
    });
  } else if (
    existingCanary.name === CANARY_NAME &&
    existingCanary.status === "ACTIVE" &&
    existingCanary.brokerageAffiliation === CANARY_AFFILIATION
  ) {
    steps.push({
      object: "Workspace B",
      action: "ALREADY_MATCHES",
      detail: `id=${prefix(existingCanary.id)} slug=${CANARY_SLUG}`,
    });
  } else {
    steps.push({
      object: "Workspace B",
      action: "DRIFT_STOP",
      detail: "tenant-canary exists with unexpected name/status/affiliation",
    });
    drift = true;
  }

  const canaryWsId = existingCanary?.id;

  const owner = await classifyUser(prisma, {
    label: "OWNER_B",
    email: identity.ownerEmail,
    expectedRole: "ADMIN",
    houzzatId: houzzatId ?? "",
    requireAgentProfile: false,
  });
  steps.push(...owner.steps);
  if (owner.drift) drift = true;

  const agent = await classifyUser(prisma, {
    label: "AGENT_B",
    email: identity.agentEmail,
    expectedRole: "AGENT",
    houzzatId: houzzatId ?? "",
    requireAgentProfile: true,
  });
  steps.push(...agent.steps);
  if (agent.drift) drift = true;

  if (canaryWsId && agent.userId) {
    const ownerMember = owner.userId
      ? await prisma.workspaceMember.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: canaryWsId,
              userId: owner.userId,
            },
          },
        })
      : null;
    if (!owner.userId) {
      steps.push({
        object: "OWNER_B WorkspaceMember",
        action: "CREATE",
        detail: "role=OWNER status=ACTIVE",
      });
    } else if (!ownerMember) {
      steps.push({
        object: "OWNER_B WorkspaceMember",
        action: "CREATE",
        detail: "role=OWNER status=ACTIVE",
      });
    } else if (
      ownerMember.role === "OWNER" &&
      ownerMember.status === "ACTIVE"
    ) {
      steps.push({
        object: "OWNER_B WorkspaceMember",
        action: "ALREADY_MATCHES",
        detail: "OWNER ACTIVE",
      });
    } else {
      steps.push({
        object: "OWNER_B WorkspaceMember",
        action: "DRIFT_STOP",
        detail: `role=${ownerMember.role} status=${ownerMember.status}`,
      });
      drift = true;
    }

    const agentMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: canaryWsId, userId: agent.userId },
      },
    });
    if (!agentMember) {
      steps.push({
        object: "AGENT_B WorkspaceMember",
        action: "CREATE",
        detail: "role=AGENT status=ACTIVE",
      });
    } else if (
      agentMember.role === "AGENT" &&
      agentMember.status === "ACTIVE"
    ) {
      steps.push({
        object: "AGENT_B WorkspaceMember",
        action: "ALREADY_MATCHES",
        detail: "AGENT ACTIVE",
      });
    } else {
      steps.push({
        object: "AGENT_B WorkspaceMember",
        action: "DRIFT_STOP",
        detail: `role=${agentMember.role} status=${agentMember.status}`,
      });
      drift = true;
    }

    if (existingCanary.primaryAgentId === agent.userId) {
      steps.push({
        object: "Primary Agent",
        action: "ALREADY_MATCHES",
        detail: "primaryAgentId=AGENT_B",
      });
    } else if (!existingCanary.primaryAgentId) {
      steps.push({
        object: "Primary Agent",
        action: "CREATE",
        detail: "set primaryAgentId=AGENT_B",
      });
    } else {
      steps.push({
        object: "Primary Agent",
        action: "DRIFT_STOP",
        detail: `primaryAgentId=${prefix(existingCanary.primaryAgentId)} expected AGENT_B`,
      });
      drift = true;
    }
  } else {
    steps.push({
      object: "WorkspaceMembers",
      action: "CREATE",
      detail: "OWNER_B + AGENT_B after workspace/users exist",
    });
    steps.push({
      object: "Primary Agent",
      action: "CREATE",
      detail: "set primaryAgentId=AGENT_B after members",
    });
  }

  const routing = await prisma.crmRoutingSettings.findUnique({
    where: { id: CANARY_ROUTING_SETTINGS_ID },
    include: { weights: true },
  });

  if (routing && routing.id === HOUZZAT_ROUTING_ID) {
    steps.push({
      object: "Routing settings",
      action: "DRIFT_STOP",
      detail: "tenant-canary-routing id collides with Houzzat default",
    });
    drift = true;
  } else if (!routing) {
    steps.push({
      object: "Routing settings",
      action: "CREATE",
      detail: `id=${CANARY_ROUTING_SETTINGS_ID} listingAgentId=AGENT_B LISTING_AGENT`,
    });
    steps.push({
      object: "Routing weights",
      action: "CREATE",
      detail: "BUYER 100% AGENT_B, SELLER 100% AGENT_B (flat creates)",
    });
  } else if (canaryWsId && routing.workspaceId === canaryWsId) {
    const buyer = routing.weights.filter((w) => w.lane === "BUYER");
    const seller = routing.weights.filter((w) => w.lane === "SELLER");
    const ok =
      routing.listingAgentId === agent.userId &&
      buyer.length === 1 &&
      seller.length === 1 &&
      buyer[0]?.percent === 100 &&
      seller[0]?.percent === 100 &&
      buyer[0]?.agentId === agent.userId &&
      seller[0]?.agentId === agent.userId;
    if (ok) {
      steps.push({
        object: "Routing settings",
        action: "ALREADY_MATCHES",
        detail: CANARY_ROUTING_SETTINGS_ID,
      });
    } else {
      steps.push({
        object: "Routing settings",
        action: "DRIFT_STOP",
        detail: "tenant-canary-routing exists with unexpected config",
      });
      drift = true;
    }
  } else {
    steps.push({
      object: "Routing settings",
      action: "DRIFT_STOP",
      detail: `id=${CANARY_ROUTING_SETTINGS_ID} belongs to foreign workspace`,
    });
    drift = true;
  }

  steps.push({
    object: "Organization B",
    action: "SKIP",
    detail: "not created — workspace is tenancy authority",
  });
  steps.push({
    object: "Lead B",
    action: "SKIP",
    detail: "not created by provisioner",
  });

  const driftStops = steps.filter((s) => s.action === "DRIFT_STOP");
  const mutationCount = steps.filter((s) => s.action === "CREATE").length;

  return {
    steps,
    driftStops,
    mutationCount,
    identity,
    houzzatBaseline,
    scopeGates,
  };
}

export async function buildRollbackPlan(
  prisma: PrismaClient,
  identity: CanaryIdentityInput,
): Promise<RollbackPlan> {
  const steps: PlanStep[] = [];
  const houzzatProtected = [
    `workspace slug ${HOUZZAT_WORKSPACE_SLUG}`,
    `routing id ${HOUZZAT_ROUTING_ID}`,
  ];

  const canary = await prisma.workspace.findUnique({
    where: { slug: CANARY_SLUG },
    select: {
      id: true,
      primaryAgentId: true,
      _count: {
        select: {
          leads: true,
          members: true,
          invites: true,
        },
      },
    },
  });

  if (!canary) {
    steps.push({
      object: "Workspace B",
      action: "SKIP",
      detail: "tenant-canary not found — nothing to rollback",
    });
    return {
      steps,
      driftStops: [],
      mutationCount: 0,
      canaryWorkspaceId: null,
      houzzatProtected,
    };
  }

  if (canary.id) {
    const houzzat = await prisma.workspace.findUnique({
      where: { slug: HOUZZAT_WORKSPACE_SLUG },
      select: { id: true },
    });
    if (houzzat && canary.id === houzzat.id) {
      steps.push({
        object: "Workspace B",
        action: "DRIFT_STOP",
        detail: "tenant-canary id equals Houzzat id",
      });
      return {
        steps,
        driftStops: steps.filter((s) => s.action === "DRIFT_STOP"),
        mutationCount: 0,
        canaryWorkspaceId: canary.id,
        houzzatProtected,
      };
    }
  }

  if (canary._count.leads > 0) {
    steps.push({
      object: "Lead safety",
      action: "DRIFT_STOP",
      detail: `${canary._count.leads} lead(s) in B — rollback refused (no cascade)`,
    });
  } else {
    steps.push({
      object: "Lead safety",
      action: "ALREADY_MATCHES",
      detail: "no leads in B",
    });
  }

  const childCounts = await Promise.all([
    prisma.agentTask.count({ where: { workspaceId: canary.id } }),
    prisma.leadNote.count({ where: { workspaceId: canary.id } }),
    prisma.leadEmailLog.count({ where: { workspaceId: canary.id } }),
  ]);
  const childTotal = childCounts.reduce((a, b) => a + b, 0);
  if (childTotal > 0) {
    steps.push({
      object: "CRM children",
      action: "DRIFT_STOP",
      detail: `${childTotal} child row(s) with workspaceId=B`,
    });
  }

  steps.push({
    object: "CrmRoutingWeight (B)",
    action: "DELETE",
    detail: `settingsId=${CANARY_ROUTING_SETTINGS_ID}`,
  });
  steps.push({
    object: "CrmRoutingSettings (B)",
    action: "DELETE",
    detail: CANARY_ROUTING_SETTINGS_ID,
  });
  steps.push({
    object: "WorkspaceInvite (B)",
    action: "DELETE",
    detail: `${canary._count.invites} invite(s) workspaceId=B`,
  });
  steps.push({
    object: "WorkspaceMember (B)",
    action: "DELETE",
    detail: `${canary._count.members} member(s)`,
  });
  steps.push({
    object: "Workspace B",
    action: "DELETE",
    detail: `slug=${CANARY_SLUG} id=${prefix(canary.id)}`,
  });

  const canaryEmails = [identity.ownerEmail, identity.agentEmail].filter(
    Boolean,
  ) as string[];
  for (const email of canaryEmails) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        workspaceMemberships: { select: { workspaceId: true } },
        _count: {
          select: {
            assignedLeads: true,
            assignedTasks: true,
          },
        },
      },
    });
    if (!user) {
      steps.push({
        object: `User ${emailHint(email)}`,
        action: "SKIP",
        detail: "not found",
      });
      continue;
    }
    const otherMemberships = user.workspaceMemberships.filter(
      (m) => m.workspaceId !== canary.id,
    );
    const hasDurable =
      otherMemberships.length > 0 ||
      user._count.assignedLeads > 0 ||
      user._count.assignedTasks > 0;
    if (hasDurable) {
      steps.push({
        object: `User ${emailHint(email)}`,
        action: "PRESERVE",
        detail: "other memberships or CRM data — not deleted",
      });
    } else {
      steps.push({
        object: `User ${emailHint(email)}`,
        action: "DELETE",
        detail: "canary-only user with no durable data",
      });
    }
  }

  const mutationCount = steps.filter((s) => s.action === "DELETE").length;
  const driftStops = steps.filter((s) => s.action === "DRIFT_STOP");

  return {
    steps,
    driftStops,
    mutationCount,
    canaryWorkspaceId: canary.id,
    houzzatProtected,
  };
}

export type ReportMode = "dry-run" | "apply-preview";

export function formatProvisionReport(
  plan: ProvisionPlan,
  mode: ReportMode = "dry-run",
): string {
  const lines: string[] = ["CANARY PROVISION PLAN", ""];
  for (const step of plan.steps) {
    lines.push(`${step.object}: ${step.action}`);
    lines.push(`  ${step.detail}`);
  }
  lines.push("");
  lines.push("Houzzat baseline: UNCHANGED EXPECTED");
  if (plan.houzzatBaseline) {
    const b = plan.houzzatBaseline;
    lines.push(
      `  ws=${prefix(b.workspaceId)} members=${b.memberCount} routing=${b.routing.settingsId} buyer=${b.routing.buyerWeights.map((w) => `${w.agentIdPrefix}:${w.percent}`).join(",")}`,
    );
  }
  lines.push("");
  lines.push(`Mutation count if --apply: ${plan.mutationCount}`);
  if (plan.driftStops.length > 0) {
    lines.push(`DRIFT_STOP count: ${plan.driftStops.length}`);
  }
  if (!plan.identity.ownerEmail || !plan.identity.agentEmail) {
    lines.push("");
    lines.push(
      "USER INPUT REQUIRED: set CANARY_OWNER_B_EMAIL and CANARY_AGENT_B_EMAIL before --apply",
    );
  }
  lines.push("");
  lines.push(
    mode === "apply-preview"
      ? "APPLY PREVIEW — mutations execute next if gates pass"
      : "DRY RUN — NO PRODUCTION MUTATIONS",
  );
  return lines.join("\n");
}

export function formatRollbackReport(
  plan: RollbackPlan,
  mode: ReportMode = "dry-run",
): string {
  const lines: string[] = ["CANARY ROLLBACK PLAN", ""];
  for (const step of plan.steps) {
    lines.push(`${step.object}: ${step.action}`);
    lines.push(`  ${step.detail}`);
  }
  lines.push("");
  lines.push("Houzzat protected:");
  for (const p of plan.houzzatProtected) {
    lines.push(`  - ${p}`);
  }
  lines.push("");
  lines.push(`Mutation count if --apply: ${plan.mutationCount}`);
  if (plan.driftStops.length > 0) {
    lines.push(`DRIFT_STOP count: ${plan.driftStops.length}`);
  }
  lines.push("");
  lines.push(
    mode === "apply-preview"
      ? "APPLY PREVIEW — mutations execute next if gates pass"
      : "DRY RUN — NO PRODUCTION MUTATIONS",
  );
  return lines.join("\n");
}
export async function executeProvisionApply(
  prisma: PrismaClient,
  identity: CanaryIdentityInput,
  baselineBefore: HouzzatBaseline,
): Promise<PlanStep[]> {
  const applied: PlanStep[] = [];

  let workspace = await prisma.workspace.findUnique({
    where: { slug: CANARY_SLUG },
  });
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        slug: CANARY_SLUG,
        name: CANARY_NAME,
        status: "ACTIVE",
        brokerageAffiliation: CANARY_AFFILIATION,
      },
    });
    applied.push({
      object: "Workspace B",
      action: "CREATE",
      detail: workspace.id,
    });
  }

  assertProtectedHouzzatIds(baselineBefore.workspaceId, workspace.id);

  async function ensureUser(
    label: string,
    email: string,
    role: "ADMIN" | "AGENT",
    withProfile: boolean,
  ): Promise<string> {
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: label === "OWNER_B" ? identity.ownerName : identity.agentName,
          role,
          isBuyer: false,
          isSeller: false,
        },
      });
      applied.push({ object: label, action: "CREATE", detail: user.id });
    }
    if (withProfile) {
      const profile = await prisma.agentProfile.findUnique({
        where: { userId: user.id },
      });
      if (!profile) {
        await prisma.agentProfile.create({
          data: { userId: user.id, active: true },
        });
        applied.push({
          object: `${label} AgentProfile`,
          action: "CREATE",
          detail: "active=true",
        });
      } else if (!profile.active) {
        await prisma.agentProfile.update({
          where: { userId: user.id },
          data: { active: true },
        });
      }
    }
    return user.id;
  }

  const ownerEmail = identity.ownerEmail!;
  const agentEmail = identity.agentEmail!;
  const ownerId = await ensureUser("OWNER_B", ownerEmail, "ADMIN", false);
  const agentId = await ensureUser("AGENT_B", agentEmail, "AGENT", true);

  async function ensureMember(
    userId: string,
    role: WorkspaceMemberRole,
    label: string,
  ) {
    const existing = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId: workspace!.id, userId },
      },
    });
    if (!existing) {
      await prisma.workspaceMember.create({
        data: {
          workspaceId: workspace!.id,
          userId,
          role,
          status: "ACTIVE" satisfies WorkspaceMemberStatus,
          joinedAt: new Date(),
        },
      });
      applied.push({
        object: `${label} WorkspaceMember`,
        action: "CREATE",
        detail: role,
      });
    }
  }

  await ensureMember(ownerId, "OWNER", "OWNER_B");
  await ensureMember(agentId, "AGENT", "AGENT_B");

  if (workspace.primaryAgentId !== agentId) {
    await prisma.workspace.update({
      where: { id: workspace.id },
      data: { primaryAgentId: agentId },
    });
    applied.push({
      object: "Primary Agent",
      action: "CREATE",
      detail: agentId,
    });
  }

  let routing = await prisma.crmRoutingSettings.findUnique({
    where: { id: CANARY_ROUTING_SETTINGS_ID },
  });
  if (!routing) {
    routing = await prisma.crmRoutingSettings.create({
      data: {
        id: CANARY_ROUTING_SETTINGS_ID,
        workspaceId: workspace.id,
        listingAgentId: agentId,
        sellerAssignMode: "LISTING_AGENT",
      },
    });
    applied.push({
      object: "Routing settings",
      action: "CREATE",
      detail: CANARY_ROUTING_SETTINGS_ID,
    });
    for (const lane of ["BUYER", "SELLER"] as const) {
      await prisma.crmRoutingWeight.create({
        data: {
          settingsId: CANARY_ROUTING_SETTINGS_ID,
          agentId,
          lane,
          percent: 100,
        },
      });
    }
    applied.push({
      object: "Routing weights",
      action: "CREATE",
      detail: "BUYER/SELLER 100%",
    });
  }

  const baselineAfter = await captureHouzzatBaseline(prisma);
  if (
    baselineAfter.workspaceId !== baselineBefore.workspaceId ||
    baselineAfter.memberCount !== baselineBefore.memberCount ||
    baselineAfter.crm.leadCount !== baselineBefore.crm.leadCount ||
    baselineAfter.routing.listingAgentIdPrefix !==
      baselineBefore.routing.listingAgentIdPrefix
  ) {
    throw new Error(
      "DRIFT_STOP: Houzzat baseline changed during provision apply",
    );
  }

  return applied;
}

export async function executeRollbackApply(
  prisma: PrismaClient,
  identity: CanaryIdentityInput,
): Promise<PlanStep[]> {
  const applied: PlanStep[] = [];
  const plan = await buildRollbackPlan(prisma, identity);
  if (plan.driftStops.length > 0) {
    throw new Error(
      `DRIFT_STOP: ${plan.driftStops.map((s) => s.detail).join("; ")}`,
    );
  }

  const canary = await prisma.workspace.findUnique({
    where: { slug: CANARY_SLUG },
    select: { id: true },
  });
  if (!canary) return applied;

  const houzzat = await prisma.workspace.findUnique({
    where: { slug: HOUZZAT_WORKSPACE_SLUG },
    select: { id: true },
  });
  if (houzzat && canary.id === houzzat.id) {
    throw new Error("DRIFT_STOP: refuse to delete Houzzat workspace");
  }

  const settings = await prisma.crmRoutingSettings.findUnique({
    where: { id: CANARY_ROUTING_SETTINGS_ID },
    select: { id: true },
  });
  if (settings?.id === HOUZZAT_ROUTING_ID) {
    throw new Error("DRIFT_STOP: refuse to touch Houzzat routing id");
  }

  if (settings) {
    await prisma.crmRoutingWeight.deleteMany({
      where: { settingsId: CANARY_ROUTING_SETTINGS_ID },
    });
    await prisma.crmRoutingSettings.delete({
      where: { id: CANARY_ROUTING_SETTINGS_ID },
    });
    applied.push({
      object: "Routing",
      action: "DELETE",
      detail: CANARY_ROUTING_SETTINGS_ID,
    });
  }

  await prisma.workspaceInvite.deleteMany({
    where: { workspaceId: canary.id },
  });
  await prisma.workspaceMember.deleteMany({
    where: { workspaceId: canary.id },
  });
  await prisma.workspace.delete({ where: { id: canary.id } });
  applied.push({
    object: "Workspace B",
    action: "DELETE",
    detail: canary.id,
  });

  const emails = [identity.ownerEmail, identity.agentEmail].filter(
    Boolean,
  ) as string[];
  for (const email of emails) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        workspaceMemberships: true,
        _count: { select: { assignedLeads: true, assignedTasks: true } },
      },
    });
    if (!user) continue;
    const hasOther =
      user.workspaceMemberships.length > 0 ||
      user._count.assignedLeads > 0 ||
      user._count.assignedTasks > 0;
    if (!hasOther) {
      await prisma.agentProfile.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
      applied.push({
        object: `User ${emailHint(email)}`,
        action: "DELETE",
        detail: user.id,
      });
    }
  }

  return applied;
}
