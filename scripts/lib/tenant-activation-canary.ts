/**
 * Stage 3J.8 — Canary password activation via WorkspaceInvite (dry-run default).
 *
 * Existing ACTIVE members with password=null cannot use createWorkspaceInvite
 * (rejects already-ACTIVE). This prepares a PENDING invite that acceptWorkspaceInvite
 * activates with the normal bcrypt password path.
 */
import type { PrismaClient, WorkspaceMemberRole } from "@prisma/client";
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

export type ActivationTarget = {
  label: "OWNER_B" | "AGENT_B";
  userId: string;
  userIdPrefix: string;
  emailHint: string;
  role: WorkspaceMemberRole;
  hasPassword: boolean;
  pendingInviteIdPrefix: string | null;
};

export type ActivationCanaryPlan = {
  steps: PlanStep[];
  driftStops: PlanStep[];
  mutationCount: number;
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

export function parseActivationCanaryCliArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  const confirmArg = argv.find((a) => a.startsWith("--confirm="));
  const confirm = confirmArg?.slice("--confirm=".length) ?? null;
  return { apply, confirm };
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

export { requireScopeAckForApply };

async function loadTargets(
  prisma: PrismaClient,
  context: CanaryBContext,
): Promise<ActivationTarget[]> {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: context.workspaceId, status: "ACTIVE" },
    select: {
      role: true,
      userId: true,
      user: { select: { email: true, password: true } },
    },
  });

  const targets: ActivationTarget[] = [];
  for (const member of members) {
    const label: "OWNER_B" | "AGENT_B" =
      member.role === "OWNER" ? "OWNER_B" : "AGENT_B";
    const pending = await prisma.workspaceInvite.findFirst({
      where: {
        workspaceId: context.workspaceId,
        email: member.user.email ?? undefined,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    targets.push({
      label,
      userId: member.userId,
      userIdPrefix: prefix(member.userId)!,
      emailHint: emailHint(member.user.email),
      role: member.role,
      hasPassword: Boolean(member.user.password),
      pendingInviteIdPrefix: prefix(pending?.id),
    });
  }
  return targets;
}

export async function buildActivationCanaryPlan(
  prisma: PrismaClient,
): Promise<ActivationCanaryPlan> {
  const steps: PlanStep[] = [];
  let drift = false;

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
    drift = true;
  }

  const targets = context ? await loadTargets(prisma, context) : [];
  for (const target of targets) {
    if (target.hasPassword) {
      steps.push({
        object: target.label,
        action: "ALREADY_MATCHES",
        detail: `password already set · ${target.emailHint}`,
      });
      continue;
    }
    if (target.pendingInviteIdPrefix) {
      steps.push({
        object: target.label,
        action: "ALREADY_MATCHES",
        detail: `pending activation invite=${target.pendingInviteIdPrefix}`,
      });
      continue;
    }
    steps.push({
      object: target.label,
      action: "CREATE",
      detail: `PENDING WorkspaceInvite for password activation · ${target.emailHint} · NO email send`,
    });
  }

  steps.push({
    object: "Email send",
    action: "SKIP",
    detail: "Stage 3J.8 dry-run — invite email not sent; raw token returned only on apply",
  });
  steps.push({
    object: "PushDevice",
    action: "SKIP",
    detail: "never created by script — AGENT_B registers via HouzzatPro after login",
  });

  const futureAcceptBehavior = [
    "User opens /auth/invite/{rawToken}",
    "UI shows password form (needsPasswordActivation)",
    "acceptWorkspaceInvite sets bcrypt password, reuses User + WorkspaceMember",
    "sets ACTIVE workspace cookie to tenant-canary",
    "no OrganizationMembership required for CRM under READ=workspace",
    "no PushDevice created",
  ];

  const driftStops = steps.filter((s) => s.action === "DRIFT_STOP");
  if (drift && driftStops.length === 0) {
    /* already recorded */
  }

  return {
    steps,
    driftStops,
    mutationCount: steps.filter((s) => s.action === "CREATE").length,
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
      ? "APPLY PREVIEW — invite rows would be created next (email still skipped)"
      : "DRY RUN — NO PRODUCTION MUTATIONS",
  );
  return lines.join("\n");
}

/**
 * Creates PENDING activation invites only. Does NOT send email.
 * Returns raw tokens once for operator handoff (never logged by default).
 */
export async function executeActivationCanaryApply(
  prisma: PrismaClient,
  context: CanaryBContext,
): Promise<{
  applied: PlanStep[];
  rawTokens: Array<{ label: string; email: string; rawToken: string }>;
}> {
  const applied: PlanStep[] = [];
  const rawTokens: Array<{ label: string; email: string; rawToken: string }> =
    [];
  const targets = await loadTargets(prisma, context);

  for (const target of targets) {
    if (target.hasPassword || target.pendingInviteIdPrefix) continue;

    const user = await prisma.user.findUnique({
      where: { id: target.userId },
      select: { email: true, password: true },
    });
    if (!user?.email || user.password) continue;

    const email = user.email.trim().toLowerCase();
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
      object: target.label,
      action: "CREATE",
      detail: `invite=${prefix(invite.id)}`,
    });
    rawTokens.push({ label: target.label, email, rawToken });
  }

  return { applied, rawTokens };
}
