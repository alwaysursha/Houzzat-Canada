/**
 * HouzzatPRO — the signed-in agent's service areas.
 * AgentProfile.markets is per user. Workspace membership only authorizes the call.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  normalizeServiceAreas,
  serviceAreaCatalog,
} from "@/lib/agent/service-areas";
import {
  loadAgentServiceAreas,
  saveAgentServiceAreas,
} from "@/lib/agent/service-areas-store";
import { authorizeMobileWorkspaceAccess } from "@/lib/mobile/v2/workspace-access";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const patchSchema = z.object({
  serviceAreas: z.array(z.string().trim().min(1).max(80)).max(12),
});

export async function GET(request: Request) {
  try {
    const access = await authorizeMobileWorkspaceAccess(request);
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, message: access.message },
        { status: access.status },
      );
    }
    const serviceAreas = await loadAgentServiceAreas(
      prisma,
      access.userId,
      access.workspaceId,
    );
    return NextResponse.json({
      ok: true,
      data: {
        serviceAreas,
        catalog: serviceAreaCatalog().map((item) => ({
          label: item.label,
          kind: item.kind,
        })),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
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
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid JSON" },
        { status: 400 },
      );
    }
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, code: "VALIDATION_ERROR", message: "Invalid service areas" },
        { status: 400 },
      );
    }
    const markets = normalizeServiceAreas(parsed.data.serviceAreas);
    if (markets.length !== parsed.data.serviceAreas.length) {
      return NextResponse.json(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "Choose a city or region from the list.",
        },
        { status: 400 },
      );
    }
    const serviceAreas = await saveAgentServiceAreas(prisma, access.userId, markets);
    return NextResponse.json({
      ok: true,
      data: { serviceAreas },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { ok: false, code: "SERVER_ERROR", message },
      { status: 500 },
    );
  }
}
