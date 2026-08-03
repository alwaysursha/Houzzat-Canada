import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/admin/audit";
import {
  CRM_ROUTING_SETTINGS_ID,
  ensureCrmRoutingSettings,
  listRoutableAgents,
} from "@/lib/agent/lead-intake";
import { auth } from "@/lib/auth";
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

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [settings, agents] = await Promise.all([
    ensureCrmRoutingSettings(),
    listRoutableAgents(),
  ]);

  return NextResponse.json({
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
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await ensureCrmRoutingSettings();
  const agents = await listRoutableAgents();
  const agentIds = new Set(agents.map((a) => a.id));

  if (parsed.data.listingAgentId) {
    if (!agentIds.has(parsed.data.listingAgentId)) {
      return NextResponse.json(
        { error: "Listing agent must be an active agent." },
        { status: 400 },
      );
    }
  }

  function validateWeights(
    weights: { agentId: string; percent: number }[] | undefined,
    label: string,
  ) {
    if (!weights) return null;
    for (const row of weights) {
      if (!agentIds.has(row.agentId)) {
        return `${label}: unknown agent`;
      }
    }
    const sum = weights.reduce((s, w) => s + w.percent, 0);
    if (weights.length > 0 && sum !== 100) {
      return `${label} percentages must total 100 (currently ${sum}).`;
    }
    return null;
  }

  const buyerErr = validateWeights(parsed.data.buyerWeights, "Buyer routing");
  if (buyerErr) {
    return NextResponse.json({ error: buyerErr }, { status: 400 });
  }
  const sellerErr = validateWeights(
    parsed.data.sellerWeights,
    "Seller routing",
  );
  if (sellerErr) {
    return NextResponse.json({ error: sellerErr }, { status: 400 });
  }

  await prisma.crmRoutingSettings.update({
    where: { id: CRM_ROUTING_SETTINGS_ID },
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
            settingsId: CRM_ROUTING_SETTINGS_ID,
            agentId: row.agentId,
            lane,
          },
        },
        create: {
          settingsId: CRM_ROUTING_SETTINGS_ID,
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
    entityId: CRM_ROUTING_SETTINGS_ID,
    summary: "Updated lead routing settings",
    meta: parsed.data,
  });

  const settings = await ensureCrmRoutingSettings();
  return NextResponse.json({
    ok: true,
    listingAgentId: settings.listingAgentId,
    sellerAssignMode: settings.sellerAssignMode,
  });
}
