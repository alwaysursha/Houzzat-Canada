/**
 * Mobile v2 — GET/PATCH /api/mobile/v2/lead-routing
 *
 * Workspace-scoped CRM lead routing. Reuses loadCrmRoutingSettingsForWorkspace
 * + listRoutableAgentsForSettings / weight validators (same as web
 * /api/admin/lead-routing tenant surface). No duplicate routing model.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  listRoutableAgentsForSettings,
  loadCrmRoutingSettingsForWorkspace,
  validateListingAgentForSettings,
  validateWeightsForSettings,
} from "@/lib/crm-routing-config";
import { authorizeMobileWorkspaceAccess } from "@/lib/mobile/v2/workspace-access";
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

function requireOwnerOrAdmin(
  role: string,
): NextResponse | null {
  if (role === "OWNER" || role === "ADMIN") return null;
  return NextResponse.json(
    {
      ok: false,
      code: "WORKSPACE_FORBIDDEN",
      message: "Lead routing requires Owner or Admin",
    },
    { status: 403 },
  );
}

export async function GET(request: Request) {
  try {
    const access = await authorizeMobileWorkspaceAccess(request);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }
    const denied = requireOwnerOrAdmin(access.role);
    if (denied) return denied;

    const settings = await loadCrmRoutingSettingsForWorkspace(
      access.workspaceId,
    );
    if (!settings) {
      return NextResponse.json(
        {
          ok: false,
          code: "NOT_FOUND",
          message: "Routing not provisioned for workspace",
        },
        { status: 404 },
      );
    }
    const agents = await listRoutableAgentsForSettings(settings);
    return NextResponse.json({
      ok: true,
      data: serializeSettings(settings, agents),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const access = await authorizeMobileWorkspaceAccess(request);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }
    const denied = requireOwnerOrAdmin(access.role);
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid payload" },
        { status: 400 },
      );
    }

    const settings = await loadCrmRoutingSettingsForWorkspace(
      access.workspaceId,
    );
    if (!settings) {
      return NextResponse.json(
        {
          ok: false,
          code: "NOT_FOUND",
          message: "Routing not provisioned for workspace",
        },
        { status: 404 },
      );
    }

    const agents = await listRoutableAgentsForSettings(settings);
    const listingErr = validateListingAgentForSettings(
      parsed.data.listingAgentId,
      agents,
    );
    if (listingErr) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: listingErr },
        { status: 400 },
      );
    }
    const buyerErr = validateWeightsForSettings(
      parsed.data.buyerWeights,
      "Buyer routing",
      agents,
    );
    if (buyerErr) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: buyerErr },
        { status: 400 },
      );
    }
    const sellerErr = validateWeightsForSettings(
      parsed.data.sellerWeights,
      "Seller routing",
      agents,
    );
    if (sellerErr) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: sellerErr },
        { status: 400 },
      );
    }

    await prisma.crmRoutingSettings.update({
      where: { id: settings.id },
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
              settingsId: settings!.id,
              agentId: row.agentId,
              lane,
            },
          },
          create: {
            settingsId: settings!.id,
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

    const updated = await loadCrmRoutingSettingsForWorkspace(
      access.workspaceId,
    );
    if (!updated) {
      return NextResponse.json({
        ok: true,
        data: {
          listingAgentId: parsed.data.listingAgentId ?? null,
          sellerAssignMode: parsed.data.sellerAssignMode ?? null,
        },
      });
    }
    const nextAgents = await listRoutableAgentsForSettings(updated);
    return NextResponse.json({
      ok: true,
      data: serializeSettings(updated, nextAgents),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
