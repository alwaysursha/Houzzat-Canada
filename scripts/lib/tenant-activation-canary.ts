/**
 * Stage 3J.9.1 — Canary password activation via WorkspaceInvite (dry-run default).
 *
 * Target selection is fail-closed:
 *   --user=agent  → AGENT_B only
 *   --user=owner  → OWNER_B only (future)
 *
 * Rotation:
 *   --rotate → cancel exact PENDING invite(s) for target, then create one fresh invite
 *
 * Production URL safety:
 *   CANARY_ACK_PRODUCTION_SCOPES=1 requires https://houzzat.com (never localhost).
 */
import type { PrismaClient, WorkspaceMemberRole } from "@prisma/client";
import { LEGACY_CRM_ORGANIZATION_SLUG } from "../../src/lib/crm-ownership";
import {
  createWorkspaceInviteRawToken,
  hashWorkspaceInviteToken,
} from "../../src/lib/workspace-invite-token";
import { WORKSPACE_INVITE_TTL_MS } from "../../src/lib/workspace-invite";
import {
  CANARY_SLUG,
  type PlanStep,
  type ReportMode,
  verifyScopeGates,
} from "./tenant-canary-provision";
import {
  type CanaryBContext,
  requireScopeAckForApply,
  resolveTrustedCanaryBContext,
} from "./tenant-lead-canary";

export const CANARY_ACTIVATION_CONFIRM_TOKEN = "tenant-canary-activation";
export const CANARY_ACTIVATION_PRODUCTION_HOST = "houzzat.com";

export type ActivationUserTarget = "agent" | "owner";

export type ActivationTarget = {
  label: "OWNER_B" | "AGENT_B";
  userId: string;
  userIdPrefix: string;
  emailHint: string;
  email: string | null;
  role: WorkspaceMemberRole;
  hasPassword: boolean;
  agentProfileActive: boolean | null;
  houzzatMember: boolean;
  demoAgentOrgSeats: number;
  pendingInviteId: string | null;
  pendingInviteIdPrefix: string | null;
};

export type ActivationCanaryPlan = {
  steps: PlanStep[];
  driftStops: PlanStep[];
  mutationCount: number;
  userTarget: ActivationUserTarget | null;
  rotate: boolean;
  activationBaseUrl: string | null;
  baseUrlError: string | null;
  targets: ActivationTarget[];
  futureAcceptBehavior: string[];
};

function prefix(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.slice(0, 8);
}

function emailHint(email: string | null | undefined): string {
  if (!email) return "…";
  const at = email.indexOf("@");
  if (at <= 1) return "…";
  return `${email.slice(0, 2)}…${email.slice(at)}`;
}

function isLocalhostHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost")
  );
}

/**
 * Resolve canonical activation base URL for canary CLI.
 * Prefer CANARY_SITE_URL → NEXT_PUBLIC_SITE_URL → NEXTAUTH_URL → https://houzzat.com
 * Localhost candidates are ignored (never used for production canary URLs).
 */
export function resolveCanaryActivationBaseUrl(env: NodeJS.ProcessEnv = process.env): {
  baseUrl: string | null;
  error: string | null;
} {
  const productionAck = env.CANARY_ACK_PRODUCTION_SCOPES?.trim() === "1";
  const rawCandidates = [
    env.CANARY_SITE_URL,
    env.NEXT_PUBLIC_SITE_URL,
    env.NEXTAUTH_URL,
  ]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v));

  const usable: string[] = [];
  let sawLocalhost = false;
  for (const raw of rawCandidates) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return { baseUrl: null, error: `Invalid activation base URL: ${raw}` };
    }
    if (isLocalhostHost(parsed.hostname)) {
      sawLocalhost = true;
      continue;
    }
    usable.push(parsed.origin);
  }

  if (usable.length === 0) {
    if (productionAck) {
      return {
        baseUrl: null,
        error: sawLocalhost
          ? "Production activation rejected localhost base URL — set CANARY_SITE_URL=https://houzzat.com"
          : "Production activation requires CANARY_SITE_URL or NEXT_PUBLIC_SITE_URL=https://houzzat.com",
      };
    }
    usable.push(`https://${CANARY_ACTIVATION_PRODUCTION_HOST}`);
  }

  const origin = usable[0]!;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return { baseUrl: null, error: `Invalid activation base URL: ${origin}` };
  }

  if (productionAck) {
    if (parsed.protocol !== "https:") {
      return {
        baseUrl: null,
        error: `Production activation requires https (got ${parsed.protocol})`,
      };
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host !== CANARY_ACTIVATION_PRODUCTION_HOST &&
      host !== `www.${CANARY_ACTIVATION_PRODUCTION_HOST}`
    ) {
      return {
        baseUrl: null,
        error: `Production activation host must be ${CANARY_ACTIVATION_PRODUCTION_HOST} (got ${host})`,
      };
    }
  }

  return { baseUrl: parsed.origin, error: null };
}

export function buildActivationInviteUrl(
  baseUrl: string,
  rawToken: string,
): string {
  return `${baseUrl.replace(/\/$/, "")}/auth/invite/${rawToken}`;
}

export function parseActivationUserTarget(
  raw: string | null,
): ActivationUserTarget | null {
  if (raw == null || raw === "") return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "agent") return "agent";
  if (normalized === "owner") return "owner";
  return null;
}

export function parseActivationCanaryCliArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  const rotate = argv.includes("--rotate");
  const confirmArg = argv.find((a) => a.startsWith("--confirm="));
  const confirm = confirmArg?.slice("--confirm=".length) ?? null;
  const userArg = argv.find((a) => a.startsWith("--user="));
  const userRaw = userArg?.slice("--user=".length) ?? null;
  const userTarget = parseActivationUserTarget(userRaw);
  return { apply, rotate, confirm, userRaw, userTarget };
}

export function validateActivationCanaryApplyConfirmation(input: {
  apply: boolean;
  confirm: string | null;
}): string | null {
  if (!input.apply) return null;
  if (input.confirm !== CANARY_ACTIVATION_CONFIRM_TOKEN) {
    return `--apply requires --confirm=${CANARY_ACTIVATION_CONFIRM_TOKEN}`;
  }
  return null;
}

export function validateActivationUserTarget(input: {
  apply: boolean;
  userRaw: string | null;
  userTarget: ActivationUserTarget | null;
}): string | null {
  if (!input.userRaw) {
    if (input.apply) {
      return "--apply requires --user=agent (or --user=owner)";
    }
    return null;
  }
  if (!input.userTarget) {
    return `Unknown --user=${input.userRaw} (allowed: agent, owner)`;
  }
  return null;
}

export { requireScopeAckForApply };

function labelForTarget(userTarget: ActivationUserTarget): "OWNER_B" | "AGENT_B" {
  return userTarget === "owner" ? "OWNER_B" : "AGENT_B";
}

function roleForTarget(userTarget: ActivationUserTarget): WorkspaceMemberRole {
  return userTarget === "owner" ? "OWNER" : "AGENT";
}

async function loadSingleTarget(
  prisma: PrismaClient,
  context: CanaryBContext,
  userTarget: ActivationUserTarget,
): Promise<ActivationTarget | null> {
  const expectedRole = roleForTarget(userTarget);
  const expectedUserId =
    userTarget === "agent" ? context.agentBId : context.ownerBId;
  if (!expectedUserId) return null;

  const member = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: context.workspaceId,
      userId: expectedUserId,
      status: "ACTIVE",
      role: expectedRole,
    },
    select: {
      role: true,
      userId: true,
      user: {
        select: {
          email: true,
          password: true,
          agentProfile: { select: { active: true } },
        },
      },
    },
  });
  if (!member) return null;

  const [houzzatMember, demoAgentOrgSeats, pending] = await Promise.all([
    prisma.workspaceMember.findFirst({
      where: {
        workspaceId: context.houzzatWorkspaceId,
        userId: member.userId,
        status: "ACTIVE",
      },
      select: { id: true },
    }),
    prisma.organizationMembership.count({
      where: {
        userId: member.userId,
        organization: { slug: LEGACY_CRM_ORGANIZATION_SLUG },
      },
    }),
    member.user.email
      ? prisma.workspaceInvite.findFirst({
          where: {
            workspaceId: context.workspaceId,
            email: member.user.email,
            status: "PENDING",
            expiresAt: { gt: new Date() },
          },
          select: { id: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve(null),
  ]);

  return {
    label: labelForTarget(userTarget),
    userId: member.userId,
    userIdPrefix: prefix(member.userId)!,
    emailHint: emailHint(member.user.email),
    email: member.user.email,
    role: member.role,
    hasPassword: Boolean(member.user.password),
    agentProfileActive: member.user.agentProfile?.active ?? null,
    houzzatMember: Boolean(houzzatMember),
    demoAgentOrgSeats,
    pendingInviteId: pending?.id ?? null,
    pendingInviteIdPrefix: prefix(pending?.id),
  };
}

function appendTargetPlanSteps(
  steps: PlanStep[],
  target: ActivationTarget,
  rotate: boolean,
  activationBaseUrl: string | null,
): void {
  steps.push({
    object: target.label,
    action: "ALREADY_MATCHES",
    detail: `user=${target.userIdPrefix} · ACTIVE ${target.role} · ${target.emailHint}`,
  });
  steps.push({
    object: "WorkspaceMember",
    action: "ALREADY_MATCHES",
    detail: `reused · role=${target.role} · workspace=${CANARY_SLUG}`,
  });

  if (target.label === "AGENT_B" && target.agentProfileActive !== true) {
    steps.push({
      object: "AgentProfile",
      action: "DRIFT_STOP",
      detail: `active=${String(target.agentProfileActive)} (expected true)`,
    });
  } else if (target.label === "AGENT_B") {
    steps.push({
      object: "AgentProfile",
      action: "ALREADY_MATCHES",
      detail: "active=true",
    });
  }

  if (target.houzzatMember) {
    steps.push({
      object: "Houzzat membership",
      action: "DRIFT_STOP",
      detail: "target has ACTIVE Houzzat seat — refuse canary activation",
    });
  } else {
    steps.push({
      object: "Houzzat membership",
      action: "ALREADY_MATCHES",
      detail: "none",
    });
  }

  if (target.label === "AGENT_B" && target.demoAgentOrgSeats > 0) {
    steps.push({
      object: "OrganizationMembership",
      action: "DRIFT_STOP",
      detail: `AGENT_B has ${target.demoAgentOrgSeats} demo-agent seat(s)`,
    });
  } else {
    steps.push({
      object: "OrganizationMembership",
      action: "SKIP",
      detail:
        target.demoAgentOrgSeats === 0
          ? "no demo-agent seat — activation will not create one"
          : `historical demo-agent seats=${target.demoAgentOrgSeats} (OWNER path; not mutated)`,
    });
  }

  steps.push({
    object: "Password state",
    action: target.hasPassword ? "ALREADY_MATCHES" : "SKIP",
    detail: target.hasPassword
      ? "password already set — no activation invite needed"
      : "activation required (password=null) — unchanged until accept",
  });

  if (target.hasPassword) {
    steps.push({
      object: "WorkspaceInvite",
      action: "ALREADY_MATCHES",
      detail: "skipped — password already set",
    });
  } else if (rotate && target.pendingInviteIdPrefix) {
    steps.push({
      object: "WorkspaceInvite (exposed)",
      action: "DELETE",
      detail: `CANCEL PENDING invite=${target.pendingInviteIdPrefix} (token treated as compromised)`,
    });
    steps.push({
      object: "WorkspaceInvite",
      action: "CREATE",
      detail: `fresh PENDING · role=${target.role} · NO email · hash-at-rest · base=${activationBaseUrl ?? "UNRESOLVED"}`,
    });
  } else if (target.pendingInviteIdPrefix && !rotate) {
    steps.push({
      object: "WorkspaceInvite",
      action: "ALREADY_MATCHES",
      detail: `pending invite=${target.pendingInviteIdPrefix} — use --rotate if token was exposed`,
    });
  } else {
    steps.push({
      object: "WorkspaceInvite",
      action: "CREATE",
      detail: `PENDING · role=${target.role} · NO email · hash-at-rest · base=${activationBaseUrl ?? "UNRESOLVED"}`,
    });
  }

  steps.push({
    object: "OrganizationInvite",
    action: "SKIP",
    detail: "workspace activation path only",
  });
  steps.push({
    object: "Email send",
    action: "SKIP",
    detail: "no automatic email — raw URL printed once on apply only",
  });
  steps.push({
    object: "PushDevice",
    action: "SKIP",
    detail: "never created by script — registers via HouzzatPro after login",
  });
  steps.push({
    object: "User / password",
    action: "PRESERVE",
    detail: "rotation does not mutate User.password or WorkspaceMember",
  });
}

export async function buildActivationCanaryPlan(
  prisma: PrismaClient,
  userTarget: ActivationUserTarget = "agent",
  options: { rotate?: boolean } = {},
): Promise<ActivationCanaryPlan> {
  const rotate = Boolean(options.rotate);
  const steps: PlanStep[] = [];
  const urlResolved = resolveCanaryActivationBaseUrl();

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
      detail: "ack present (local env)",
    });
  }

  if (urlResolved.error) {
    steps.push({
      object: "Activation URL",
      action: "DRIFT_STOP",
      detail: urlResolved.error,
    });
  } else {
    steps.push({
      object: "Activation URL",
      action: "ALREADY_MATCHES",
      detail: `${urlResolved.baseUrl}/auth/invite/{rawToken}`,
    });
  }

  steps.push({
    object: "Target filter",
    action: "ALREADY_MATCHES",
    detail: `--user=${userTarget} → ${labelForTarget(userTarget)} only${rotate ? " · --rotate" : ""}`,
  });

  let context: CanaryBContext | null = null;
  try {
    context = await resolveTrustedCanaryBContext(prisma);
    steps.push({
      object: "Workspace B",
      action: "ALREADY_MATCHES",
      detail: `slug=${CANARY_SLUG}`,
    });
  } catch (error) {
    steps.push({
      object: "Workspace B",
      action: "DRIFT_STOP",
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const targets: ActivationTarget[] = [];
  if (context) {
    const target = await loadSingleTarget(prisma, context, userTarget);
    if (!target) {
      steps.push({
        object: labelForTarget(userTarget),
        action: "DRIFT_STOP",
        detail: "expected ACTIVE WorkspaceMember not found",
      });
    } else {
      if (rotate && !target.pendingInviteIdPrefix && !target.hasPassword) {
        steps.push({
          object: "Rotate",
          action: "SKIP",
          detail: "no PENDING invite to cancel — will CREATE only",
        });
      }
      targets.push(target);
      appendTargetPlanSteps(steps, target, rotate, urlResolved.baseUrl);
    }
  }

  const futureAcceptBehavior = [
    "DO NOT paste activation URL/token into chat/logs",
    "User opens https://houzzat.com/auth/invite/{rawToken}",
    "UI shows password form (needsPasswordActivation)",
    "acceptWorkspaceInvite sets bcrypt password, reuses User + WorkspaceMember",
    "sets ACTIVE workspace cookie to tenant-canary",
    "no OrganizationMembership / PushDevice created by this flow",
  ];

  return {
    steps,
    driftStops: steps.filter((s) => s.action === "DRIFT_STOP"),
    mutationCount: steps.filter(
      (s) => s.action === "CREATE" || s.action === "DELETE",
    ).length,
    userTarget,
    rotate,
    activationBaseUrl: urlResolved.baseUrl,
    baseUrlError: urlResolved.error,
    targets,
    futureAcceptBehavior,
  };
}

export function formatActivationCanaryReport(
  plan: ActivationCanaryPlan,
  mode: ReportMode = "dry-run",
): string {
  const lines: string[] = ["CANARY ACTIVATION PLAN", ""];
  for (const step of plan.steps) {
    lines.push(`${step.object}: ${step.action}`);
    lines.push(`  ${step.detail}`);
  }
  if (plan.futureAcceptBehavior.length > 0) {
    lines.push("");
    lines.push("Future accept behavior:");
    for (const row of plan.futureAcceptBehavior) {
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
      ? "APPLY PREVIEW — invite cancel/create executes next if gates pass"
      : "DRY RUN — NO PRODUCTION MUTATIONS",
  );
  return lines.join("\n");
}

/**
 * Creates or rotates PENDING activation invite for the selected target only.
 * Does NOT send email. Returns raw token once for operator handoff.
 */
export async function executeActivationCanaryApply(
  prisma: PrismaClient,
  context: CanaryBContext,
  userTarget: ActivationUserTarget,
  options: { rotate?: boolean } = {},
): Promise<{
  applied: PlanStep[];
  rawTokens: Array<{
    label: string;
    email: string;
    activationUrl: string;
  }>;
}> {
  const rotate = Boolean(options.rotate);
  const applied: PlanStep[] = [];
  const rawTokens: Array<{
    label: string;
    email: string;
    activationUrl: string;
  }> = [];

  const urlResolved = resolveCanaryActivationBaseUrl();
  if (urlResolved.error || !urlResolved.baseUrl) {
    throw new Error(`DRIFT_STOP: ${urlResolved.error ?? "activation base URL missing"}`);
  }

  const target = await loadSingleTarget(prisma, context, userTarget);
  if (!target) {
    throw new Error("DRIFT_STOP: activation target not found");
  }
  if (target.houzzatMember) {
    throw new Error("DRIFT_STOP: target has Houzzat membership");
  }
  if (userTarget === "agent" && target.demoAgentOrgSeats > 0) {
    throw new Error("DRIFT_STOP: AGENT_B has demo-agent OrganizationMembership");
  }
  if (userTarget === "agent" && target.agentProfileActive !== true) {
    throw new Error("DRIFT_STOP: AGENT_B AgentProfile inactive");
  }
  if (target.hasPassword) {
    applied.push({
      object: target.label,
      action: "ALREADY_MATCHES",
      detail: "password already set",
    });
    return { applied, rawTokens };
  }
  if (!target.email) {
    throw new Error("DRIFT_STOP: target email missing");
  }

  const email = target.email.trim().toLowerCase();

  if (rotate) {
    const pendingRows = await prisma.workspaceInvite.findMany({
      where: {
        workspaceId: context.workspaceId,
        email,
        status: "PENDING",
      },
      select: { id: true },
    });
    for (const row of pendingRows) {
      await prisma.workspaceInvite.update({
        where: { id: row.id },
        data: { status: "CANCELLED" },
      });
      applied.push({
        object: "WorkspaceInvite",
        action: "DELETE",
        detail: `CANCELLED ${prefix(row.id)}`,
      });
    }
  } else if (target.pendingInviteId) {
    applied.push({
      object: "WorkspaceInvite",
      action: "ALREADY_MATCHES",
      detail: target.pendingInviteIdPrefix ?? target.pendingInviteId,
    });
    return { applied, rawTokens };
  }

  const rawToken = createWorkspaceInviteRawToken();
  const tokenHash = hashWorkspaceInviteToken(rawToken);
  const expiresAt = new Date(Date.now() + WORKSPACE_INVITE_TTL_MS);

  const invite = await prisma.workspaceInvite.create({
    data: {
      workspaceId: context.workspaceId,
      email,
      role: target.role,
      token: tokenHash,
      invitedById: context.ownerBId,
      status: "PENDING",
      expiresAt,
    },
  });

  applied.push({
    object: "WorkspaceInvite",
    action: "CREATE",
    detail: `id=${prefix(invite.id)} user=${target.label}`,
  });
  rawTokens.push({
    label: target.label,
    email,
    activationUrl: buildActivationInviteUrl(urlResolved.baseUrl, rawToken),
  });

  return { applied, rawTokens };
}
