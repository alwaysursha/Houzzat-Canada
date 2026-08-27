import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/admin/audit";
import { CRM_ROUTING_SETTINGS_ID } from "@/lib/agent/routing-types";
import {
  authorizeTenantCommandCentre,
  resolveAdminSurfaceMode,
} from "@/lib/admin/tenant-command-centre-auth";
import {
  ensureCrmRoutingSettings,
  listRoutableAgentsForSettings,
  loadCrmRoutingSettingsForWorkspace,
  validateListingAgentForSettings,
  validateWeightsForSettings,
} from "@/lib/crm-routing-config";
import { auth } from "@/lib/auth";
import { extractTrustedRequestHostname } from "@/lib/tenancy/extract-request-hostname";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const weightSchema = z.object({
  agentId: z.string().min(1),
  percent: z.number().int().min(0).max(100),
});

const patchSchema = z.object({
  listingAgentId: z.string().min(1).nullable().optional(),
  sellerAssignMode: z.enum(["LISTING_AGENT", "PERCENTAGE"]).optional(),
  buyerWeights: z.array(weightSchema).optional(),
  sellerWeights: z.array(weightSchema).optional(),
});

function serializeSettings(
  settings: NonNullable<
    Awaited<ReturnType<typeof loadCrmRoutingSettingsForWorkspace>>
  >,
  agents: Awaited<ReturnType<typeof listRoutableAgentsForSettings>>,
) {
  return {
    agents,
    listingAgentId: settings.listingAgentId,
    listingAgent: settings.listingAgent,
    sellerAssignMode: settings.sellerAssignMode,
    buyerWeights: settings.weights
      .filter((w) => w.lane === "BUYER")
      .map((w) => ({
        agentId: w.agentId,
        percent: w.percent,
        assignedCount: w.assignedCount,
        agent: w.agent,
      })),
    sellerWeights: settings.weights
      .filter((w) => w.lane === "SELLER")
      .map((w) => ({
        agentId: w.agentId,
        percent: w.percent,
        assignedCount: w.assignedCount,
        agent: w.agent,
      })),
  };
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hostname = extractTrustedRequestHostname(request);
  const surface = resolveAdminSurfaceMode(hostname);

  if (surface === "tenant") {
    const tenant = await authorizeTenantCommandCentre(request, {
      id: session.user.id,
      role: session.user.role ?? "",
    });
    if (!tenant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const settings = await loadCrmRoutingSettingsForWorkspace(
      tenant.workspaceId,
    );
    if (!settings) {
      return NextResponse.json(
        { error: "Routing not provisioned for workspace" },
        { status: 404 },
      );
    }
    const agents = await listRoutableAgentsForSettings(settings);
    return NextResponse.json(serializeSettings(settings, agents));
  }

  if (surface !== "platform" || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await ensureCrmRoutingSettings();
  const agents = await listRoutableAgentsForSettings(settings);
  return NextResponse.json(serializeSettings(settings, agents));
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const hostname = extractTrustedRequestHostname(request);
  const surface = resolveAdminSurfaceMode(hostname);

  let settingsId = CRM_ROUTING_SETTINGS_ID;
  let settings =
    surface === "platform" ? await ensureCrmRoutingSettings() : null;

  if (surface === "tenant") {
    const tenant = await authorizeTenantCommandCentre(request, {
      id: session.user.id,
      role: session.user.role ?? "",
    });
    if (!tenant) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    settings = await loadCrmRoutingSettingsForWorkspace(tenant.workspaceId);
    if (!settings) {
      return NextResponse.json(
        { error: "Routing not provisioned for workspace" },
        { status: 404 },
      );
    }
    settingsId = settings.id;
  } else if (surface !== "platform" || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!settings) {
    return NextResponse.json({ error: "Settings missing" }, { status: 404 });
  }

  const agents = await listRoutableAgentsForSettings(settings);

  const listingErr = validateListingAgentForSettings(
    parsed.data.listingAgentId,
    agents,
  );
  if (listingErr) {
    return NextResponse.json({ error: listingErr }, { status: 400 });
  }

  const buyerErr = validateWeightsForSettings(
    parsed.data.buyerWeights,
    "Buyer routing",
    agents,
  );
  if (buyerErr) {
    return NextResponse.json({ error: buyerErr }, { status: 400 });
  }
  const sellerErr = validateWeightsForSettings(
    parsed.data.sellerWeights,
    "Seller routing",
    agents,
  );
  if (sellerErr) {
    return NextResponse.json({ error: sellerErr }, { status: 400 });
  }

  await prisma.crmRoutingSettings.update({
    where: { id: settingsId },
    data: {
      ...(parsed.data.listingAgentId !== undefined
        ? { listingAgentId: parsed.data.listingAgentId }
        : {}),
      ...(parsed.data.sellerAssignMode
        ? { sellerAssignMode: parsed.data.sellerAssignMode }
        : {}),
    },
  });

  async function upsertLane(
    lane: "BUYER" | "SELLER",
    weights: { agentId: string; percent: number }[],
  ) {
    for (const row of weights) {
      await prisma.crmRoutingWeight.upsert({
        where: {
          settingsId_agentId_lane: {
            settingsId,
            agentId: row.agentId,
            lane,
          },
        },
        create: {
          settingsId,
          agentId: row.agentId,
          lane,
          percent: row.percent,
        },
        update: { percent: row.percent },
      });
    }
  }

  if (parsed.data.buyerWeights) {
    await upsertLane("BUYER", parsed.data.buyerWeights);
  }
  if (parsed.data.sellerWeights) {
    await upsertLane("SELLER", parsed.data.sellerWeights);
  }

  await writeAuditLog({
    actorId: session.user.id,
    action: "crm.routing.update",
    entityType: "CrmRoutingSettings",
    entityId: settingsId,
    summary: "Updated lead routing settings",
    meta: parsed.data,
  });

  const updated =
    surface === "tenant"
      ? await loadCrmRoutingSettingsForWorkspace(settings.workspaceId!)
      : await ensureCrmRoutingSettings();

  return NextResponse.json({
    ok: true,
    listingAgentId: updated?.listingAgentId ?? null,
    sellerAssignMode: updated?.sellerAssignMode ?? null,
  });
}
