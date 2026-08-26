/**
 * Stage 3J.11 — Tenant B Lead_B real push canary (dry-run default).
 *
 * Uses production workspace authorization + houzzatpro device resolution.
 * Email is never invoked.
 */
import type { PrismaClient } from "@prisma/client";
import { openLeadHandoffHref } from "../../src/lib/agent/lead-profile-query";
import {
  audienceForPushType,
  isPushTypeEnabled,
  shellForAudience,
} from "../../src/lib/notifications/catalog";
import { deliverPushToUsersNow, isFirebasePushConfigured } from "../../src/lib/notifications/push";
import type { PushDeliveryResult } from "../../src/lib/notifications/push";
import {
  filterStaffRecipientsForLead,
  resolveLeadDeskNotifiers,
} from "../../src/lib/workspace-notification-recipients";
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
  CANARY_SLUG,
  type PlanStep,
  type ReportMode,
  verifyScopeGates,
} from "./tenant-canary-provision";

export const CANARY_PUSH_CONFIRM_TOKEN = "tenant-canary-push";
export const CANARY_PUSH_ACTIVITY_TYPE = "canary_push";
export const CANARY_PUSH_MARKER = "[CANARY][TENANT-B-PUSH]";

export type CanaryPushMarkerStatus = "ATTEMPTED" | "SENT" | "FAILED";

function readMarkerStatus(meta: unknown, body: string | null): CanaryPushMarkerStatus {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const status = (meta as Record<string, unknown>).status;
    if (status === "SENT" || status === "FAILED" || status === "ATTEMPTED") {
      return status;
    }
  }
  // Legacy Stage 3J.11 marker wrote "scheduled" before FCM — treat as FAILED/retryable.
  if (body?.includes(" scheduled")) return "FAILED";
  if (body?.includes(" SENT")) return "SENT";
  if (body?.includes(" FAILED")) return "FAILED";
  return "ATTEMPTED";
}

export type PushCanaryPlan = {
  steps: PlanStep[];
  driftStops: PlanStep[];
  mutationCount: number;
  leadId: string | null;
  leadIdPrefix: string | null;
  href: string | null;
  authorizedPrefixes: string[];
  houzzatInAuthorized: number;
  deviceCounts: Record<string, number>;
  physicalTargetPrefixes: string[];
  physicalTargetCount: number;
  preferenceEnabled: Record<string, boolean>;
  alreadySent: boolean;
  firebaseConfigured: boolean;
  priorMarkerStatus: CanaryPushMarkerStatus | null;
};

function prefix(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.slice(0, 8);
}

export function parsePushCanaryCliArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  const confirmArg = argv.find((a) => a.startsWith("--confirm="));
  const confirm = confirmArg?.slice("--confirm=".length) ?? null;
  return { apply, confirm };
}

export function validatePushCanaryApplyConfirmation(input: {
  apply: boolean;
  confirm: string | null;
}): string | null {
  if (!input.apply) return null;
  if (input.confirm !== CANARY_PUSH_CONFIRM_TOKEN) {
    return `--apply requires --confirm=${CANARY_PUSH_CONFIRM_TOKEN}`;
  }
  return null;
}

export { requireLeadEmailForApply, requireScopeAckForApply, resolveLeadCanaryInputFromEnv };

export function enableWorkspaceNotificationSimulation() {
  process.env.WORKSPACE_NOTIFICATION_SCOPE = "workspace";
}

async function findExactCanaryLeadB(
  prisma: PrismaClient,
  context: CanaryBContext,
  leadEmail: string,
) {
  const leads = await prisma.lead.findMany({
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
      status: true,
    },
  });
  return leads;
}

async function findCanaryPushMarkers(
  prisma: PrismaClient,
  leadId: string,
) {
  return prisma.leadActivity.findMany({
    where: {
      leadId,
      type: CANARY_PUSH_ACTIVITY_TYPE,
      body: { contains: CANARY_PUSH_MARKER },
    },
    select: { id: true, body: true, meta: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

async function findSuccessfulPushMarker(
  prisma: PrismaClient,
  leadId: string,
): Promise<{ id: string } | null> {
  const rows = await findCanaryPushMarkers(prisma, leadId);
  const sent = rows.find(
    (row) => readMarkerStatus(row.meta, row.body) === "SENT",
  );
  return sent ? { id: sent.id } : null;
}

export async function buildPushCanaryPlan(
  prisma: PrismaClient,
  input: LeadCanaryInput,
): Promise<PushCanaryPlan> {
  enableWorkspaceNotificationSimulation();

  const steps: PlanStep[] = [];
  let leadId: string | null = null;
  let leadIdPrefix: string | null = null;
  let href: string | null = null;
  let authorizedPrefixes: string[] = [];
  let houzzatInAuthorized = 0;
  const deviceCounts: Record<string, number> = {};
  let physicalTargetPrefixes: string[] = [];
  let physicalTargetCount = 0;
  const preferenceEnabled: Record<string, boolean> = {};
  let alreadySent = false;
  let priorMarkerStatus: CanaryPushMarkerStatus | null = null;
  const firebaseConfigured = isFirebasePushConfigured();

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
      detail: "ack present; WORKSPACE_NOTIFICATION_SCOPE simulated = workspace",
    });
  }

  if (!firebaseConfigured) {
    steps.push({
      object: "Firebase",
      action: "DRIFT_STOP",
      detail:
        "FIREBASE_SERVICE_ACCOUNT missing locally — CLI would stub ([push:stub]) and never reach FCM",
    });
  } else {
    steps.push({
      object: "Firebase",
      action: "ALREADY_MATCHES",
      detail: "FIREBASE_SERVICE_ACCOUNT present (JSON not logged)",
    });
  }

  let context: CanaryBContext | null = null;
  try {
    context = await resolveTrustedCanaryBContext(prisma);
    steps.push({
      object: "Workspace B",
      action: "ALREADY_MATCHES",
      detail: `slug=${CANARY_SLUG} ACTIVE`,
    });
  } catch (error) {
    steps.push({
      object: "Workspace B",
      action: "DRIFT_STOP",
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  if (!input.leadEmail) {
    steps.push({
      object: "Lead_B",
      action: "DRIFT_STOP",
      detail: "CANARY_LEAD_B_EMAIL required",
    });
  } else if (context) {
    const leads = await findExactCanaryLeadB(prisma, context, input.leadEmail);
    if (leads.length !== 1) {
      steps.push({
        object: "Lead_B",
        action: "DRIFT_STOP",
        detail: `expected exactly 1 canary lead, found ${leads.length}`,
      });
    } else {
      const lead = leads[0]!;
      if (lead.workspaceId !== context.workspaceId) {
        steps.push({
          object: "Lead_B",
          action: "DRIFT_STOP",
          detail: "workspaceId != tenant-canary",
        });
      } else if (lead.assignedAgentId !== context.agentBId) {
        steps.push({
          object: "Lead_B",
          action: "DRIFT_STOP",
          detail: "assignedAgentId != AGENT_B",
        });
      } else if (!lead.notes?.includes(CANARY_LEAD_MARKER)) {
        steps.push({
          object: "Lead_B",
          action: "DRIFT_STOP",
          detail: "missing canary marker",
        });
      } else {
        leadId = lead.id;
        leadIdPrefix = prefix(lead.id);
        href = openLeadHandoffHref(lead.id);
        steps.push({
          object: "Lead_B",
          action: "ALREADY_MATCHES",
          detail: `id=${leadIdPrefix} assignee=${prefix(context.agentBId)} marker=${CANARY_LEAD_MARKER}`,
        });

        const markers = await findCanaryPushMarkers(prisma, lead.id);
        const sentMarker = markers.find(
          (row) => readMarkerStatus(row.meta, row.body) === "SENT",
        );
        alreadySent = Boolean(sentMarker);
        if (markers.length > 0) {
          const latest = markers[markers.length - 1]!;
          priorMarkerStatus = readMarkerStatus(latest.meta, latest.body);
        }
        if (alreadySent) {
          steps.push({
            object: "Push send marker",
            action: "ALREADY_MATCHES",
            detail: `SENT marker=${prefix(sentMarker!.id)} — no second send`,
          });
        } else if (markers.length > 0) {
          steps.push({
            object: "Push send marker",
            action: "SKIP",
            detail: `prior ${priorMarkerStatus} marker(s)=${markers.length} (retryable — not SENT)`,
          });
        } else {
          steps.push({
            object: "Push send marker",
            action: "SKIP",
            detail: "none yet — apply writes ATTEMPTED then SENT/FAILED after FCM",
          });
        }

        const desk = await resolveLeadDeskNotifiers({
          organizationId: context.compatOrgId,
          workspaceId: lead.workspaceId,
        });
        const candidates = [
          ...new Set(
            [lead.assignedAgentId, ...desk.map((d) => d.user.id)].filter(
              Boolean,
            ) as string[],
          ),
        ];
        const authorized = await filterStaffRecipientsForLead(
          lead.id,
          candidates,
          "new_lead",
        );
        authorizedPrefixes = authorized.map((id) => prefix(id)!);

        const houzzatMembers = await prisma.workspaceMember.findMany({
          where: {
            workspaceId: context.houzzatWorkspaceId,
            status: "ACTIVE",
          },
          select: { userId: true },
        });
        const houzzatIds = new Set(houzzatMembers.map((m) => m.userId));
        houzzatInAuthorized = authorized.filter((id) => houzzatIds.has(id)).length;

        if (houzzatInAuthorized > 0) {
          steps.push({
            object: "Recipient isolation",
            action: "DRIFT_STOP",
            detail: `${houzzatInAuthorized} Houzzat user(s) in authorized set`,
          });
        } else {
          steps.push({
            object: "Recipients authorized",
            action: "ALREADY_MATCHES",
            detail: `[${authorizedPrefixes.join(",")}]`,
          });
          steps.push({
            object: "Houzzat authorized",
            action: "ALREADY_MATCHES",
            detail: "0",
          });
        }

        const shell = shellForAudience(audienceForPushType("new_lead"));
        const physicalTargets: string[] = [];

        for (const userId of authorized) {
          const key = prefix(userId)!;
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { pushNotificationPrefs: true },
          });
          const prefOn = isPushTypeEnabled(user?.pushNotificationPrefs, "new_lead");
          preferenceEnabled[key] = prefOn;

          const count = await prisma.pushDevice.count({
            where: { userId, shell },
          });
          deviceCounts[key] = count;

          if (!prefOn) continue;
          if (count === 0) continue;
          if (houzzatIds.has(userId)) {
            steps.push({
              object: "Physical targets",
              action: "DRIFT_STOP",
              detail: `Houzzat user ${key} appeared in device targets`,
            });
            continue;
          }
          physicalTargets.push(userId);
        }

        physicalTargetPrefixes = physicalTargets.map((id) => prefix(id)!);
        physicalTargetCount = physicalTargets.length;

        steps.push({
          object: "PushDevices",
          action: "ALREADY_MATCHES",
          detail: `shell=${shell} counts=${JSON.stringify(deviceCounts)}`,
        });
        steps.push({
          object: "Preference new_lead",
          action: "ALREADY_MATCHES",
          detail: JSON.stringify(preferenceEnabled),
        });

        if (physicalTargetCount === 0 && !alreadySent) {
          steps.push({
            object: "Physical targets",
            action: "SKIP",
            detail: "0 devices with new_lead enabled — apply would SKIP send",
          });
        } else if (
          !steps.some(
            (s) => s.object === "Physical targets" && s.action === "DRIFT_STOP",
          )
        ) {
          steps.push({
            object: "Physical targets",
            action: alreadySent ? "ALREADY_MATCHES" : "CREATE",
            detail: `count=${physicalTargetCount} prefixes=[${physicalTargetPrefixes.join(",")}]`,
          });
        }

        steps.push({
          object: "Href",
          action: "ALREADY_MATCHES",
          detail: href,
        });
        steps.push({
          object: "Email",
          action: "SKIP",
          detail: "PUSH ONLY — staff new_lead email not invoked",
        });
        steps.push({
          object: "Payload",
          action: alreadySent ? "ALREADY_MATCHES" : "CREATE",
          detail:
            'type=new_lead title="[CANARY] New lead (Tenant B)" via production deliverPushToUsersNow',
        });
      }
    }
  }

  const driftStops = steps.filter((s) => s.action === "DRIFT_STOP");
  const mutationCount = alreadySent
    ? 0
    : steps.filter((s) => s.action === "CREATE").length;

  return {
    steps,
    driftStops,
    mutationCount,
    leadId,
    leadIdPrefix,
    href,
    authorizedPrefixes,
    houzzatInAuthorized,
    deviceCounts,
    physicalTargetPrefixes,
    physicalTargetCount,
    preferenceEnabled,
    alreadySent,
    firebaseConfigured,
    priorMarkerStatus,
  };
}

export function formatPushCanaryReport(
  plan: PushCanaryPlan,
  mode: ReportMode = "dry-run",
): string {
  const lines: string[] = ["TENANT B PUSH CANARY PLAN", ""];
  for (const step of plan.steps) {
    lines.push(`${step.object}: ${step.action}`);
    lines.push(`  ${step.detail}`);
  }
  lines.push("");
  lines.push(`Authorized: [${plan.authorizedPrefixes.join(",")}]`);
  lines.push(`Houzzat authorized: ${plan.houzzatInAuthorized}`);
  lines.push(`PushDevices: ${JSON.stringify(plan.deviceCounts)}`);
  lines.push(
    `Physical targets: ${plan.physicalTargetCount} [${plan.physicalTargetPrefixes.join(",")}]`,
  );
  lines.push(`Href: ${plan.href ?? "(none)"}`);
  lines.push("Email: SKIP");
  lines.push("");
  lines.push(`Mutation count if --apply: ${plan.mutationCount}`);
  if (plan.driftStops.length > 0) {
    lines.push(`DRIFT_STOP count: ${plan.driftStops.length}`);
  }
  lines.push("");
  lines.push(
    mode === "apply-preview"
      ? "APPLY PREVIEW — one push executes next if gates pass"
      : "DRY RUN — NO PUSH SENT",
  );
  return lines.join("\n");
}

export async function executePushCanaryApply(
  prisma: PrismaClient,
  context: CanaryBContext,
  input: LeadCanaryInput,
): Promise<PlanStep[]> {
  enableWorkspaceNotificationSimulation();
  const applied: PlanStep[] = [];

  if (!input.leadEmail) {
    throw new Error("DRIFT_STOP: CANARY_LEAD_B_EMAIL required");
  }

  const leads = await findExactCanaryLeadB(prisma, context, input.leadEmail);
  if (leads.length !== 1) {
    throw new Error(`DRIFT_STOP: expected 1 Lead_B, found ${leads.length}`);
  }
  const lead = leads[0]!;
  if (lead.workspaceId !== context.workspaceId) {
    throw new Error("DRIFT_STOP: Lead_B workspace mismatch");
  }
  if (lead.assignedAgentId !== context.agentBId) {
    throw new Error("DRIFT_STOP: Lead_B assignee mismatch");
  }

  const existingSent = await findSuccessfulPushMarker(prisma, lead.id);
  if (existingSent) {
    applied.push({
      object: "Push",
      action: "ALREADY_MATCHES",
      detail: `SENT marker=${prefix(existingSent.id)} — no second send`,
    });
    return applied;
  }

  if (!isFirebasePushConfigured()) {
    throw new Error(
      "DRIFT_STOP: FIREBASE_SERVICE_ACCOUNT missing — refuse stub send (would not reach FCM)",
    );
  }

  const desk = await resolveLeadDeskNotifiers({
    organizationId: context.compatOrgId,
    workspaceId: lead.workspaceId,
  });
  const candidates = [
    ...new Set(
      [lead.assignedAgentId, ...desk.map((d) => d.user.id)].filter(
        Boolean,
      ) as string[],
    ),
  ];
  const authorized = await filterStaffRecipientsForLead(
    lead.id,
    candidates,
    "new_lead",
  );

  const houzzatMembers = await prisma.workspaceMember.findMany({
    where: { workspaceId: context.houzzatWorkspaceId, status: "ACTIVE" },
    select: { userId: true },
  });
  const houzzatIds = new Set(houzzatMembers.map((m) => m.userId));
  if (authorized.some((id) => houzzatIds.has(id))) {
    throw new Error("DRIFT_STOP: Houzzat user in authorized recipients");
  }

  const shell = shellForAudience(audienceForPushType("new_lead"));
  const physicalTargets: string[] = [];
  for (const userId of authorized) {
    if (houzzatIds.has(userId)) {
      throw new Error("DRIFT_STOP: Houzzat user in physical targets");
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pushNotificationPrefs: true },
    });
    if (!isPushTypeEnabled(user?.pushNotificationPrefs, "new_lead")) continue;
    const devices = await prisma.pushDevice.count({
      where: { userId, shell },
    });
    if (devices > 0) physicalTargets.push(userId);
  }

  if (physicalTargets.length === 0) {
    applied.push({
      object: "Push",
      action: "SKIP",
      detail: "no devices with new_lead enabled",
    });
    return applied;
  }

  const href = openLeadHandoffHref(lead.id);
  const attemptMeta = {
    kind: "tenant_b_push_canary",
    status: "ATTEMPTED" as const,
    physicalTargetPrefixes: physicalTargets.map((id) => prefix(id)),
  };

  // Reuse latest non-SENT marker if present (legacy scheduled / FAILED), else create.
  const prior = await findCanaryPushMarkers(prisma, lead.id);
  const retryable = [...prior]
    .reverse()
    .find((row) => readMarkerStatus(row.meta, row.body) !== "SENT");
  let markerId: string;
  if (retryable) {
    await prisma.leadActivity.update({
      where: { id: retryable.id },
      data: {
        body: `${CANARY_PUSH_MARKER} new_lead push canary ATTEMPTED`,
        meta: attemptMeta,
      },
    });
    markerId = retryable.id;
    applied.push({
      object: "Push send marker",
      action: "CREATE",
      detail: `ATTEMPTED reuse=${prefix(markerId)}`,
    });
  } else {
    const marker = await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        userId: context.agentBId,
        type: CANARY_PUSH_ACTIVITY_TYPE,
        body: `${CANARY_PUSH_MARKER} new_lead push canary ATTEMPTED`,
        meta: attemptMeta,
      },
    });
    markerId = marker.id;
    applied.push({
      object: "Push send marker",
      action: "CREATE",
      detail: `ATTEMPTED ${prefix(markerId)}`,
    });
  }

  const results: PushDeliveryResult[] = await deliverPushToUsersNow(
    physicalTargets,
    {
      type: "new_lead",
      title: "[CANARY] New lead (Tenant B)",
      body: "Tenant-canary Lead_B push isolation check — open this lead in workspace B.",
      href,
    },
  );

  const anySent = results.some((r) => r.status === "sent");
  const anySkipped = results.some((r) => r.status === "skipped");
  const summary = results
    .map((r) => `${prefix(r.userId)}:${r.status}`)
    .join(",");

  if (anySent) {
    await prisma.leadActivity.update({
      where: { id: markerId },
      data: {
        body: `${CANARY_PUSH_MARKER} new_lead push canary SENT`,
        meta: {
          ...attemptMeta,
          status: "SENT",
          delivery: summary,
        },
      },
    });
    applied.push({
      object: "Push",
      action: "CREATE",
      detail: `SENT [${summary}] href=${href}`,
    });
    return applied;
  }

  await prisma.leadActivity.update({
    where: { id: markerId },
    data: {
      body: `${CANARY_PUSH_MARKER} new_lead push canary FAILED`,
      meta: {
        ...attemptMeta,
        status: "FAILED",
        delivery: summary,
      },
    },
  });

  if (anySkipped) {
    throw new Error(
      `DRIFT_STOP: FCM stubbed/skipped ([push:stub]) — delivery=[${summary}]`,
    );
  }
  throw new Error(`DRIFT_STOP: FCM delivery failed — delivery=[${summary}]`);
}
